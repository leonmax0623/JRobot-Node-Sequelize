const { combineSequence, convert } = require('../../tools/audio-api');

module.exports = [
  {
    method: 'get',
    path: '/sessions',
    /**
     * Получение списка сессий
     */
    async handler(ctx) {
      const { user } = ctx.state;
      ctx.assert(user.role === 'admin' || (user.role === 'manager' && user.groupId), 403);
      const conditions = [];
      switch (user.role) {
        case 'admin': {
          conditions.push(`users."accountId" = ${user.accountId}`);
          break;
        }
        case 'manager': {
          conditions.push(`users."groupId" = ${user.groupId}`);
          break;
        }
        default: break;
      }
      if ('userId' in ctx.query) {
        conditions.push(`users.id = ${ctx.query.userId}`);
      }
      if ('scriptId' in ctx.query) {
        conditions.push(`scripts.id = ${ctx.query.scriptId}`);
      }
      if ('examination' in ctx.query && +ctx.query.examination === 1) {
        conditions.push('examination is true');
      }
      if ('start' in ctx.query) {
        const date = ctx.memory.sqlDatetime(new Date(+ctx.query.start));
        conditions.push(`sessions."createdAt" >= ${date}`);
      }
      if ('end' in ctx.query) {
        const date = ctx.memory.sqlDatetime(new Date(+ctx.query.end));
        conditions.push(`sessions."createdAt" <= ${date}`);
      }

      const data = await ctx.memory.select(`
        select
          sessions."id" id,
          sessions."userId" "userId",
          sessions."scriptId" "scriptId",
          sessions."success" success,
          sessions."examination" examination,
          sessions."duration" duration,
          sessions."createdAt" "createdAt",
          sessions."faults" faults,
          (
            select count(*) > 0 and count(*) - count(record) = 0
            from "Replicas"
            where "sessionId" = sessions.id
          ) "isRecordAvailable"
        from
          "Sessions" sessions
          join
          "Users" users on sessions."userId" = users.id
          join
          "Scripts" scripts on sessions."scriptId" = scripts.id
        where
          ${conditions.join(' and ')}
        order by
          sessions."createdAt" desc
      `);

      ctx.body = data.map((x) => ({
        ...x,
        isRecordAvailable: !!x.isRecordAvailable,
        success: !!x.success,
        examination: !!x.examination,
      }));

      // Если указан параметр onlyRecords, то даю сессии только с записями
      if (ctx.query.onlyRecords) {
        ctx.body = ctx.body.filter(({ isRecordAvailable }) => isRecordAvailable);
      }
    },
  },
  {
    method: 'get',
    path: '/session-record',
    /**
     * Получение записи сессии
     */
    async handler(ctx) {
      const { user: { role, groupId, accountId } } = ctx.state;
      ctx.assert(role === 'admin' || (role === 'manager' && groupId), 403);
      const replicas = await ctx.memory.select(`
        select record
        from
          "Replicas"
          join "Sessions" on "Sessions".id = "Replicas"."sessionId"
          join "Users" on "Sessions"."userId" = "Users".id
        where
          "Replicas"."sessionId" = ${ctx.query.sessionId}
          and "Users".${role === 'admin' ? `"accountId" = ${accountId}` : `"groupId" = ${groupId}`}
          and record is not null
        order by "speakedAt" asc
      `);
      ctx.assert(replicas.length, 404, 'Replicas not found');
      const sequence = replicas.map(({ record }) => ({
        data: record,
        mimeType: 'audio/ogg',
      }));
      const combined = await combineSequence(sequence);
      ctx.assert(combined, 500, 'Combined is null!');

      // Если запрашивает Safari/iOS, надо преобразовать к mp3
      const { 'user-agent': userAgent } = ctx.headers;
      const iOS = /(iPhone|iPad)/i.test(userAgent);
      const Safari = !/Chrome/i.test(userAgent) && /Safari/i.test(userAgent);

      if (iOS || Safari) {
        ctx.body = await convert({
          data: combined,
          from: 'opus',
          to: 'mp3',
        });
        ctx.type = 'audio/mp3';
      } else {
        ctx.body = combined;
        ctx.type = 'audio/ogg';
      }
    },
  },
  {
    method: 'get',
    path: '/available-records',
    /**
     * Получение списка пользователей (их id), для которых есть записи сессий
     *
     * query: start, end, scriptId
     *    scriptId - для конкретного сценария. Нет -- для всех
     * --> body: number[] - список id пользователей, для которых доступно
     */
    async handler(ctx) {
      const { user } = ctx.state;
      ctx.assert(user.role === 'admin' || (user.role === 'manager' && user.groupId), 403);
      const conditions = [];
      if (user.role === 'admin') {
        conditions.push(`users."accountId" = ${user.accountId}`);
      } else {
        conditions.push(`users."groupId" = ${user.groupId}`);
      }
      if ('start' in ctx.query) {
        const date = ctx.memory.sqlDatetime(new Date(+ctx.query.start));
        conditions.push(`sessions."createdAt" >= ${date}`);
      }
      if ('end' in ctx.query) {
        const date = ctx.memory.sqlDatetime(new Date(+ctx.query.end));
        conditions.push(`sessions."createdAt" <= ${date}`);
      }
      if ('scriptId' in ctx.query) {
        conditions.push(`sessions."scriptId" = ${ctx.query.scriptId}`);
      }
      const result = await ctx.memory.select(`
        select distinct uid
        from (
          select
            users.id uid,
            sessions.id sid,
            count(replicas.id) total,
            count(replicas.record) records
          from
            "Users" users
            join "Sessions" sessions on sessions."userId" = users.id
            join "Replicas" replicas on replicas."sessionId" = sessions.id
          where
            ${conditions.join(' and ')}
          group by users.id, sessions.id
        ) ids where total > 0 and records = total
      `);
      ctx.body = result.map(({ uid }) => uid);
    },
  },
];
