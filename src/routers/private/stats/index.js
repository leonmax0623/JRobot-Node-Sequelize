const core = require('./core');
const partnerStats = require('../../../tools/partner-stats');

module.exports = [
  {
    method: 'get',
    path: '/my-stats',
    /**
     * Собственная статистика пользователя
     */
    async handler(ctx) {
      ctx.body = await core.myStats(ctx.state.user.id);
    },
  },
  {
    method: 'get',
    path: '/users-stats',
    /**
     * Статистика пользователей группы/аккаунта
     */
    async handler(ctx) {
      const opts = { accountId: ctx.state.account.id };

      if ('start' in ctx.query) {
        opts.start = +ctx.query.start;
      }
      if ('end' in ctx.query) {
        opts.end = +ctx.query.end;
      }
      if ('scriptId' in ctx.query) {
        opts.scriptId = +ctx.query.scriptId;
      }

      switch (ctx.state.user.role) {
        case 'admin': {
          if ('groupId' in ctx.query) {
            opts.groupId = +ctx.query.groupId;
          }
          break;
        }
        case 'manager': {
          const { groupId } = ctx.state.user;
          ctx.assert(groupId, 403, 'Not allowed for manager out of group');
          opts.groupId = groupId;
          break;
        }
        default: {
          ctx.throw(403, 'Role not admin and not manager');
          break;
        }
      }

      ctx.body = await core.usersStats(opts);
    },
  },
  {
    method: 'get',
    path: '/my-examination-progress',
    /**
     * Собственный экзаменационный прогресс
     */
    async handler(ctx) {
      const { id: userId } = ctx.state.user;
      ctx.body = await ctx.memory.examinationProgress({ userId });
    },
  },
  {
    method: 'get',
    path: '/users-examination-progress',
    /**
     * Экзаменационный прогресс пользователей
     */
    async handler(ctx) {
      // администратор - для всех
      // менеджер, если в группе - для группы
      // остальных найух
      const { accountId, groupId, role } = ctx.state.user;
      const { scriptId } = ctx.query;
      switch (role) {
        case 'admin': {
          ctx.body = await ctx.memory.examinationProgress({ accountId, scriptId });
          break;
        }
        case 'manager': {
          ctx.assert(groupId, 403, 'Not allowed for manager out of group');
          ctx.body = await ctx.memory.examinationProgress({ groupId, scriptId });
          break;
        }
        default: {
          ctx.throw(403, 'Role not admin and not manager .-.');
          break;
        }
      }
    },
  },
  {
    method: 'get',
    path: '/my-gradual-progress',
    /**
     * Собственный прогресс постепенного прохождения сценария
     */
    async handler(ctx) {
      ctx.body = await core.gradualProgress({
        userId: ctx.state.user.id,
      });
    },
  },
  {
    method: 'get',
    path: '/users-gradual-progress',
    /**
     * Прогресс постепенного прохождения пользователей аккаунта/группы
     */
    async handler(ctx) {
      const opts = { accountId: ctx.state.account.id };

      if ('scriptId' in ctx.query) {
        opts.scriptId = +ctx.query.scriptId;
      }

      switch (ctx.state.user.role) {
        case 'admin': {
          if ('groupId' in ctx.query) {
            opts.groupId = +ctx.query.groupId;
          }
          break;
        }
        case 'manager': {
          const { groupId } = ctx.state.user;
          ctx.assert(groupId, 403, 'Not allowed for manager out of group');
          opts.groupId = groupId;
          break;
        }
        default: {
          ctx.throw(403, 'Role not admin and not manager');
          break;
        }
      }

      ctx.body = await core.gradualProgress(opts);
    },
  },
  {
    method: 'get',
    path: '/partner-stats',
    /**
     * Партнёрская статистика (для партнёрских аккаунтов)
     */
    async handler(ctx) {
      ctx.assert(ctx.state.account.partner, 403, 'allowed only for partners');
      const opts = { partnerId: ctx.state.account.id };
      if ('start' in ctx.query) {
        opts.start = +ctx.query.start;
        ctx.assert(!isNaN(opts.start), 400, 'invalid_period');
      }
      if ('end' in ctx.query) {
        opts.end = +ctx.query.end;
        ctx.assert(!isNaN(opts.end), 400, 'invalid_period');
      }
      ctx.body = await partnerStats.computeForPartner(opts);
    },
  },
];
