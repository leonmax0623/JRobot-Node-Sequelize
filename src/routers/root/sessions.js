const { combineSequence } = require('../../tools/audio-api');

module.exports = [
  {
    method: 'get',
    path: '/sessions',
    /**
     * Получение списка сессий аккаунта
     */
    async handler(ctx) {
      ctx.assert(ctx.query.accountId, 400, 'No account id');
      const { sqlDatetime } = ctx.memory;
      const datesRange = [
        sqlDatetime(new Date(+ctx.query.start || 0)),
        sqlDatetime(new Date(+ctx.query.end || Date.now())),
      ];
      const conditions = [
        `"Sessions"."accountId" = ${ctx.query.accountId}`,
        `"createdAt" between ${datesRange.join(' and ')}`,
      ];
      if ('userId' in ctx.query) {
        conditions.push(`"Sessions"."userId" = ${ctx.query.userId}`);
      }
      if ('scriptId' in ctx.query) {
        conditions.push(`"Sessions"."scriptId" = ${ctx.query.scriptId}`);
      }

      const sessions = await ctx.memory.select(`
        select
          "Sessions".id id,
          "Sessions"."userId" "userId",
          "Sessions"."scriptId" "scriptId",
          "Sessions".success success,
          "Sessions".examination examination,
          "Sessions".duration duration,
          "Sessions"."createdAt" "createdAt",
          "Sessions".faults faults,
          "Sessions"."courseId" "courseId",
          (
            select count(*) > 0 and count(*) - count(record) = 0
            from "Replicas"
            where "sessionId" = "Sessions".id
          ) "isRecordAvailable"
        from
          "Sessions"
        where
          ${conditions.join(' and ')}
        order by "Sessions"."createdAt" desc
      `);

      sessions.forEach((row) => {
        ['examination', 'success', 'isRecordAvailable']
          .forEach((columnName) => {
            /* eslint-disable-next-line no-param-reassign */
            row[columnName] = !!row[columnName];
          });
      });

      ctx.body = sessions;
    },
  },
  {
    method: 'get',
    path: '/session-record',
    /**
     * Получение записи сессии
     */
    async handler(ctx) {
      const { sessionId } = ctx.query;
      ctx.assert(sessionId, 400, 'No sessionId in query');
      const replicas = await ctx.db.Replica.findAll({
        where: {
          sessionId,
          record: {
            [ctx.memory.Op.not]: null,
          },
        },
      });
      if (!replicas.length) {
        ctx.status = 204;
      } else {
        const sequence = await replicas.map(({ record }) => ({
          data: record,
          mimeType: 'audio/ogg',
        }));
        const combined = await combineSequence(sequence);
        ctx.assert(combined, 500, 'Combined not exist!');
        ctx.body = combined;
        ctx.type = 'audio/ogg';
      }
    },
  },
  {
    method: 'get',
    path: '/session-transcript',
    /**
     * Получение реплик сессии
     */
    async handler(ctx) {
      const { sessionId } = ctx.query;
      ctx.assert(sessionId, 400, 'No sessionId in query');
      const replicas = await ctx.db.Replica.findAll({
        where: { sessionId },
        attributes: ['id', 'text', 'author', 'recognitionType'],
      });
      if (!replicas.length) {
        ctx.status = 204;
      } else {
        ctx.body = await replicas.map(({ dataValues }) => dataValues);
      }
    },
  },
];
