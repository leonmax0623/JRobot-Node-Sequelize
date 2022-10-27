const PATH = '/scripts';

module.exports = [
  {
    method: 'get',
    path: PATH,
    // Получение списка сценариев
    async handler(ctx) {
      const { id: scriptId } = ctx.query;
      if (isNaN(scriptId)) {
        const data = await ctx.db.Script.findAll({
          where: { accountId: 1187 }, // sripts from Account | hello@jrobot.pro
          attributes: [
            'id',
            'meta',
            'archivedAt',
            'destroyedAt',
            'public',
            'partnerScriptCategoryId',
            'accountId',
            'createdAt',
          ],
        });
        ctx.body = data.map((x) => {
          const {
            id,
            meta: {
              caption = null,
            } = {},
            accountId,
            archivedAt,
            destroyedAt,
            public: pub,
            partnerScriptCategoryId,
            createdAt,
          } = x.dataValues;
          return {
            id,
            caption,
            accountId,
            archived: !!archivedAt,
            destroyed: !!destroyedAt,
            public: pub,
            partnerScriptCategoryId,
            createdAt,
          };
        });
      } else {
        const data = await ctx.db.Script.findByPk(scriptId);
        ctx.assert(data, 404, 'Script not found');
        const { meta, structure, accountId } = data.dataValues;
        ctx.body = {
          id: scriptId, structure, accountId, meta,
        };
      }
    },
  },
  // {
  //   method: 'put',
  //   path: PATH,
  //   // создание сценария
  //   async handler(ctx) {
  //     const { accountId } = ctx.query;
  //     const { id } = await ctx.db.Script.create({
  //       ...ctx.request.body,
  //       accountId,
  //       orderNum: await ctx.db.Script.max('orderNum', {
  //         where: { accountId },
  //       }) + 1,
  //     });
  //     ctx.body = { id };
  //     ctx.status = 201;
  //   },
  // },
  {
    method: 'patch',
    path: PATH,
    async handler(ctx) {
      const item = await ctx.db.Script.findByPk(ctx.query.id);
      ctx.assert(item, 404, 'Script not found');
      await ctx.memory.update.script(item, ctx.request.body, true);
      ctx.status = 204;
    },
  },
  {
    method: 'delete',
    path: PATH,
    async handler(ctx) {
      const item = await ctx.db.Script.findByPk(ctx.query.id);
      ctx.assert(item, 404, 'Script not found');
      if (!item) ctx.throw(404);
      // Если установлен параметр force в query, то сценарий будет удалён
      // по-настоящему, а не просто destroyedAt
      await ctx.memory.destroyScript(item, { force: !!ctx.query.force });
      ctx.status = 204;
    },
  },
  {
    method: 'post',
    path: '/restore-script',
    async handler(ctx) {
      await ctx.db.Script.update(
        { destroyedAt: null },
        { where: { id: ctx.query.id } },
      );
      ctx.status = 204;
    },
  },
  {
    method: 'post',
    path: '/archive-script',
    async handler(ctx) {
      const item = await ctx.db.Script.findByPk(ctx.query.id);
      ctx.assert(item, 404, 'Script not found');
      if (!item) ctx.throw(404);

      await ctx.memory.archiveScript(item);
      ctx.status = 204;
    },
  },
  {
    method: 'post',
    path: '/unarchive-script',
    async handler(ctx) {
      const item = await ctx.db.Script.findByPk(ctx.query.id);
      ctx.assert(item, 404, 'Script not found');
      if (!item) ctx.throw(404);

      await ctx.memory.unarchiveScript(item);
      ctx.status = 204;
    },
  },
  {
    method: 'post',
    path: '/copy-script',
    async handler(ctx) {
      /** @type {{ scriptId: number, accounts: number[] }} */
      const { scriptId, accounts } = ctx.request.body;
      const script = await ctx.db.Script.findByPk(scriptId);
      ctx.assert(script, 404, 'Script not found');
      await ctx.db.Script.bulkCreate(accounts.map(
        (id) => ({
          accountId: id,
          meta: script.meta,
          structure: script.structure,
        }),
      ));
      ctx.status = 204;
    },
  },
  {
    method: 'get',
    path: '/account-partner-scripts',
    async handler(ctx) {
      const { accountId } = ctx.query;
      ctx.assert(accountId, 400, 'accountId not provided');
      const account = await ctx.db.Account.findByPk(accountId);
      ctx.assert(account, 400, 'account not found');
      const scripts = await account.getPartnerScripts();
      ctx.body = scripts.map(({ id }) => id);
    },
  },
  {
    method: 'post',
    path: '/account-partner-scripts',
    /**
     * Установка подписок аккаунта на партнёрские сценарии
     */
    async handler(ctx) {
      const { accountId } = ctx.query;
      ctx.assert(accountId, 400, 'accountId not provided');
      const account = await ctx.db.Account.findByPk(accountId);
      ctx.assert(account, 400, 'account not found');
      ctx.assert(Array.isArray(ctx.request.body), 400, 'body is not an array');
      await account.setPartnerScripts(ctx.request.body);
      ctx.status = 204;
    },
  },
];
