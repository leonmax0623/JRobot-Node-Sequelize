const partnerStats = require('../../tools/partner-stats');

const ACCOUNT_ATTRS = [
  'id',
  'name',
  'timeLeft',
  'deadline',
  'status',
  'active',
  'createdAt',
  'speechRecognitionType',
  'usersLimit',
  'timePerMonth',
  'remainingMonths',
  'partner',
  'becomedLiveAt',
  'params',
  'inn',
];

module.exports = [
  {
    path: '/accounts',
    method: 'get',
    /**
     * Получение списка аккаунтов
     */
    async handler(ctx) {
      const data = await ctx.db.Account.findAll({
        order: [
          ['createdAt', 'DESC'],
        ],
        attributes: ACCOUNT_ATTRS,
      });
      ctx.body = data.map(({ dataValues }) => dataValues);
    },
  },
  {
    path: '/accounts',
    method: 'put',
    /**
     * Добавление аккаунта (можно и нужно указать его имя)
     */
    async handler(ctx) {
      const { name } = ctx.request.body;
      const account = await ctx.memory.create.account(name);
      ctx.body = { id: account.dataValues.id };
    },
  },
  {
    path: '/accounts',
    method: 'patch',
    /**
     * Изменений данных аккаунта
     */
    async handler(ctx) {
      const item = await ctx.db.Account.findByPk(ctx.query.id);
      ctx.assert(item, 404, 'Account not found');
      const data = ctx.request.body;
      if (data.status && data.status === 'live') {
        data.becomedLiveAt = new Date();
      }
      if (data.records_limit) {
        data.params = item.params || {};
        data.params.records_limit = data.records_limit;
      }
      // eslint-disable-next-line
      if (data.hasOwnProperty('premium_voices')) {
        data.params = item.params || {};
        data.params.premium_voices = data.premium_voices;
      }
      await item.update(data);
      ctx.status = 204;
    },
  },
  {
    path: '/accounts',
    method: 'delete',
    /**
     * Удаление аккаунта
     */
    async handler(ctx) {
      const item = await ctx.db.Account.findByPk(ctx.query.id);
      ctx.assert(item, 404, 'Account not found');
      await ctx.memory.destroyAccount(item);
      ctx.status = 204;
    },
  },
  {
    path: '/accounts-stats',
    method: 'get',
    /**
     * Получение статистики аккаунтов
     */
    async handler(ctx) {
      const { id, start = 0, end = Date.now() } = ctx.query;
      const startDate = ctx.memory.sqlDatetime(new Date(+start));
      const endDate = ctx.memory.sqlDatetime(new Date(+end));

      const conditions = [
        `"createdAt" between ${startDate} and ${endDate}`,
      ];
      if (!isNaN(id)) {
        conditions.push(`"accountId" = ${id}`);
      }

      ctx.body = await ctx.memory.select(`
        select
          "accountId",
          count(*) count,
          sum(case when success then 1 else 0 end) success,
          sum(duration) duration
        from "Sessions"
        where ${conditions.join(' and ')}
        group by "accountId"
      `);
    },
  },
  {
    method: 'post',
    path: '/create-account-from-template',
    /**
     * Создание нового аккаунта из шаблона
     */
    async handler(ctx) {
      const accountName = `Template account at ${new Date()}`;
      const account = await ctx.db.sequelize.transaction(
        () => ctx.memory.create.accountFromTemplate(accountName),
      );

      ctx.body = { id: account.id };
      ctx.status = 201;
    },
  },
  {
    method: 'get',
    path: '/partner-account-stats',
    /**
     * Получение партнёрской статистики аккаунта
     */
    async handler(ctx) {
      const id = +ctx.query.id;
      ctx.assert(!isNaN(id), 400, 'invalid_id');
      const opts = { partnerId: id };
      if ('start' in ctx.query) {
        opts.start = +ctx.query.start;
      }
      if ('end' in ctx.query) {
        opts.end = +ctx.query.end;
      }
      ctx.body = await partnerStats.computeForPartner(opts);
    },
  },
];
