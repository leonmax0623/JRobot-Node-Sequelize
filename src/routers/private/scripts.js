const amoHooks = require('../../amoCRM/hooks');
const monitoringEvents = require('../../tools/monitoring-events');

const PATH = '/scripts';

module.exports = [
  {
    path: PATH,
    method: 'get',
    // Получение списка сценариев
    async handler(ctx) {
      const { id: scriptId } = ctx.query;
      const archived = +ctx.query.archived === 1;
      const destoyed = +ctx.query.destoyed === 1;

      // Если в query указан scriptId, то возвращаю данные вместе со структурой
      if (scriptId) {
        ctx.assert(ctx.state.user.role === 'admin', 403);
        const script = await ctx.db.Script.findOne({
          where: {
            id: scriptId,
            accountId: ctx.state.user.accountId,
            destroyedAt: { [ctx.memory.Op.is]: null },
          },
          attributes: ['id', 'meta', 'structure'],
        });
        ctx.assert(script, 404, 'script_not_found');
        ctx.body = script.dataValues;
        return;
      }

      // Если запрашивает партнёр, то соответствующие данные отправляю
      if (ctx.state.account.partner) {
        const scripts = await ctx.db.Script.findAll({
          where: {
            accountId: ctx.state.account.id,
            archivedAt: { [ctx.memory.Op[archived ? 'not' : 'is']]: null },
            destroyedAt: { [ctx.memory.Op.is]: null },
          },
          attributes: [
            'id',
            'meta',
            'public',
            'partnerScriptCategoryId',
          ],
        });

        ctx.body = scripts.map(({ dataValues }) => dataValues);
        return;
      }

      // Если администратор запрашивает сценарии из архива, то их и беру
      if (ctx.state.user.role === 'admin' && archived) {
        const scripts = await ctx.db.Script.findAll({
          where: {
            accountId: ctx.state.account.id,
            archivedAt: { [ctx.memory.Op.not]: null },
            destroyedAt: { [ctx.memory.Op.is]: null },
          },
          attributes: [
            'id',
            'meta',
          ],
        });

        ctx.body = scripts.map(({ dataValues }) => ({
          ...dataValues,
          partner: null,
          partnerScriptCategoryId: null,
        }));
        return;
      }

      // Если администратор запрашивает сценарии из архива, то их и беру
      if (ctx.state.user.role === 'admin' && destoyed) {
        const scripts = await ctx.db.Script.findAll({
          where: {
            accountId: ctx.state.account.id,
            destroyedAt: { [ctx.memory.Op.not]: null },
          },
          attributes: [
            'id',
            'meta',
          ],
        });

        ctx.body = scripts.map(({ dataValues }) => ({
          ...dataValues,
          partner: null,
          partnerScriptCategoryId: null,
        }));
        return;
      }

      // Во всех иных случаях такой вот запрос
      // Спецификация в test/get-scripts.spec.js

      let [scripts, orders] = await Promise.all([
        // Загружаю вообще все доступные для аккаунта сценарии
        // Сначала личные аккаунта, затем партнёрские
        ctx.memory.select(`
          select
            id,
            meta,
            null partner,
            null "partnerScriptCategoryId"
          from "Scripts"
          where
            "accountId" = ${ctx.state.account.id}
            and "archivedAt" is null
            and "destroyedAt" is null
          
          union all
          
          select
            "Scripts".id,
            "Scripts".meta,
            "Accounts".name partner,
            "partnerScriptCategoryId"
          from
            "Scripts"
            join "Accounts" on "Accounts".id = "Scripts"."accountId"
            join "AccountPartnerScript" on "AccountPartnerScript"."scriptId" = "Scripts".id
          where
            "AccountPartnerScript"."accountId" = ${ctx.state.account.id}
            and "Accounts".partner
            and "Scripts".public
            and "Scripts"."archivedAt" is null
            and "Scripts"."destroyedAt" is null
        `),
        ctx.db.AccountScriptOrder.findAll({ where: { accountId: ctx.state.account.id } }),
      ]);

      /**
       * Если пользователь - не админ, то надо отфильтровать сценарии по группам
       */
      if (ctx.state.user.role !== 'admin') {
        const { groupId } = ctx.state.user;

        // Беру связи групп и сценариев для аккаунта пользователя
        const groupScript = await ctx.memory.select(`
          select "groupId", "scriptId"
          from "GroupScript"
          where "groupId" in (select id from "Groups" where "accountId" = ${ctx.state.account.id})
        `);

        if (groupId) {
          /**
           * Множество id сценариев, которые открыты группе
           */
          const groupSet = new Set(
            groupScript
              .filter(({ groupId: val }) => val === groupId)
              .map(({ scriptId: val }) => val),
          );

          // Отбираю только те сценарии, которые в группе
          scripts = scripts.filter(({ id }) => groupSet.has(id));
        } else {
          // Множество id сценариев, которые лежат вообще в каких-то группах
          const allScriptsInGroups = new Set(groupScript.map(({ scriptId: val }) => val));

          // Отбираю только те сценарии, которые не принадлежат ни одной группе
          scripts = scripts.filter(({ id }) => !allScriptsInGroups.has(id));
        }
      }

      // Сортировка
      // Сначала расставить те сценарии, которые есть в AccountScriptOrder, затем все оставшиеся
      const scriptsMap = new Map(scripts.map((item) => [item.id, item]));
      const ordersSet = new Set(orders.map(({ scriptId: val }) => val));
      const orderedScripts = [
        ...orders
          .filter(({ scriptId: val }) => scriptsMap.has(val))
          .map(({ scriptId: val }) => scriptsMap.get(val)),
        ...scripts
          .filter(({ id }) => !ordersSet.has(id)),
      ];

      ctx.body = orderedScripts;
    },
  },
  {
    path: PATH,
    method: 'put',
    // Создание сценария
    async handler(ctx) {
      allowedOnlyForAdmin(ctx);
      const { accountId } = ctx.state.user;
      const data = {
        ...await parseScriptData(ctx),
        accountId,
        // orderNum: await computeOrderNum(ctx),
      };

      // Создаю сценарий
      const script = await ctx.db.Script.create(data);

      // Создаю спец. событие и отправляю данные в amoCRM
      await Promise.all([
        ctx.db.MonitoringEvent.create({
          type: monitoringEvents.types.SCRIPT_PATCHED,
          extra: {
            accountId,
            userId: ctx.state.user.id,
            scriptId: script.id,
            create: true,
          },
        }),
        amoHooks.scriptEdited(ctx.state.user),
      ]);

      ctx.body = { id: script.id };
      ctx.status = 201;
    },
  },
  {
    path: PATH,
    method: 'patch',
    /**
     * Изменение данных сценария
     */
    async handler(ctx) {
      allowedOnlyForAdmin(ctx);
      const script = await ctx.db.Script.findOne({
        where: {
          id: ctx.query.id,
          accountId: ctx.state.user.accountId,
          destroyedAt: { [ctx.memory.Op.is]: null },
        },
      });
      ctx.assert(script, 404, 'Script not found');

      const data = await parseScriptData(ctx);
      await Promise.all([
        ctx.db.MonitoringEvent.create({
          type: monitoringEvents.types.SCRIPT_PATCHED,
          extra: {
            accountId: ctx.state.user.accountId,
            userId: ctx.state.user.id,
            scriptId: script.id,
            create: false,
          },
        }),
        script.update(data),
        amoHooks.scriptEdited(ctx.state.user),
      ]);
      ctx.status = 204;
    },
  },
  {
    path: '/archive-script',
    method: 'post',
    /**
     * Удаление сценария (отправка в архив)
     */
    async handler(ctx) {
      allowedOnlyForAdmin(ctx);
      const script = await ctx.db.Script.findOne({
        where: {
          id: ctx.query.id,
          accountId: ctx.state.user.accountId,
          destroyedAt: { [ctx.memory.Op.is]: null },
        },
      });
      ctx.assert(script, 404, 'Script not found');
      await ctx.memory.archiveScript(script);
      ctx.status = 204;
    },
  },
  {
    path: PATH,
    method: 'delete',
    /**
     * Удаление сценария (уничтожение / удаление)
     */
    async handler(ctx) {
      allowedOnlyForAdmin(ctx);
      const script = await ctx.db.Script.findOne({
        where: {
          id: ctx.query.id,
          accountId: ctx.state.user.accountId,
          destroyedAt: { [ctx.memory.Op.is]: null },
        },
      });
      ctx.assert(script, 404, 'Script not found');
      await ctx.memory.destroyScript(script);
      ctx.status = 204;
    },
  },
  {
    path: '/duplicate-script',
    method: 'post',
    /**
     * Дублирование сценария
     */
    async handler(ctx) {
      allowedOnlyForAdmin(ctx);
      const { accountId } = ctx.state.user;
      const script = await ctx.db.Script.findOne({
        where: {
          id: ctx.query.id,
          accountId,
          destroyedAt: { [ctx.memory.Op.is]: null },
        },
      });
      ctx.assert(script, 404, 'Script not found');

      // const currentMaxOrder = await ctx.db.Script.max('orderNum', {
      //   where: { accountId },
      // });

      const { meta: sourceMeta, structure } = script;
      const meta = { ...(sourceMeta || {}) };
      if (!meta.caption) {
        meta.caption = '';
      }
      meta.caption = `Копия ${meta.caption}`;
      const created = await ctx.db.Script.create({
        meta,
        structure,
        accountId,
        // orderNum: script.orderNum,
      });
      ctx.body = { id: created.id };
      ctx.status = 201;
    },
  },
  {
    path: '/unarchive-script',
    method: 'post',
    /**
     * Восстановление сценария из архива
     */
    async handler(ctx) {
      allowedOnlyForAdmin(ctx);
      const script = await ctx.db.Script.findOne({
        where: {
          id: ctx.query.id,
          accountId: ctx.state.user.accountId,
          destroyedAt: { [ctx.memory.Op.is]: null },
        },
      });
      ctx.assert(script, 404, 'Script not found');
      ctx.assert(script.archivedAt !== null, 400, 'Script not archived');
      await ctx.memory.unarchiveScript(script);
      ctx.status = 204;
    },
  },
  {
    path: '/set-scripts-order',
    method: 'post',
    /**
     * Установка порядка сценариев
     */
    async handler(ctx) {
      allowedOnlyForAdmin(ctx);

      const data = ctx.request.body;
      ctx.assert(data, 400, 'no_data');
      ctx.assert(Array.isArray(data), 400, 'invalid_data');
      ctx.assert(data.every((x) => typeof x === 'number'), 400, 'invalid_data');

      // Я думаю, что можно забить на проверку того, чтобы все id в переданном списке
      // были из сценариев аккаунта либо из аккаунта партнёра
      // А foreign key проверки и так будут

      await ctx.db.sequelize.transaction(async (transaction) => {
        const { id: accountId } = ctx.state.account;
        const bulkData = ctx.request.body.map((value) => ({
          accountId,
          scriptId: value,
        }));

        await ctx.db.AccountScriptOrder.destroy({
          where: { accountId },
        }, { transaction });
        await ctx.db.AccountScriptOrder.bulkCreate(bulkData, { transaction });
      });

      ctx.status = 204;
    },
  },
  {
    method: 'get',
    path: '/partner-script-categories',
    /**
     * Получение списка доступных партнёрских категорий
     */
    async handler(ctx) {
      const items = await ctx.db.PartnerScriptCategory.findAll();
      ctx.body = items.map(({ dataValues }) => dataValues);
    },
  },
  {
    method: 'get',
    path: '/library-scripts',
    /**
     * Получение сценариев из библиотеки
     */
    async handler(ctx) {
      ctx.assert(ctx.state.user.role === 'admin', 403);

      const opts = {};
      if ('categoryId' in ctx.query) {
        opts.categoryId = +ctx.query.categoryId;
      }

      ctx.body = await ctx.memory.getLibraryScripts(opts);
    },
  },
  {
    method: 'get',
    path: '/partner-subscriptions',
    /**
     * Получение данных о подписках на партнёрские сценарии
     */
    async handler(ctx) {
      ctx.assert(ctx.state.user.role === 'admin', 403);

      const scripts = await ctx.state.account.getPartnerScripts();
      ctx.body = scripts.map(({ id }) => id);
    },
  },
  {
    method: 'post',
    path: '/subscribe-to-partner-script',
    /**
     * Подписка на партнёрский сценарий
     */
    async handler(ctx) {
      ctx.assert(ctx.state.user.role === 'admin', 403);

      const id = +ctx.query.id;
      ctx.assert(!isNaN(id), 400, 'Invalid id in query (or not provided)');

      const [{ value }] = await ctx.memory.select(`
        select count(*) "value"
        from
          "Scripts"
          join "Accounts" on "Accounts".id = "Scripts"."accountId"
        where
          "Scripts".id = ${id}
          and "Accounts".partner
          and "Scripts".public
          and "Scripts"."destroyedAt" is null
      `);
      ctx.assert(value === 1, 404, 'script_not_found');

      await ctx.state.account.addPartnerScript(id);
      ctx.status = 204;
    },
  },
  {
    method: 'post',
    path: '/unsubscribe-from-partner-script',
    /**
     * Отписка от партнёрского сценария
     */
    async handler(ctx) {
      ctx.assert(ctx.state.user.role === 'admin', 403);

      const id = +ctx.query.id;
      ctx.assert(!isNaN(id), 400, 'Invalid id in query (or not provided)');

      await ctx.state.account.removePartnerScript(id);
      ctx.status = 204;
    },
  },
];

/**
 * Проверка. Выбрасывает ошибку, если запрашиваемый пользователь не админ
 */
function allowedOnlyForAdmin(ctx) {
  ctx.assert(ctx.state.user.role === 'admin', 403, 'Allowed only for admin!');
}

/**
 * Парсинг данных сценария для его создания/редактирования.
 * Проверка данных на корректность
 */
async function parseScriptData(ctx) {
  const { body } = ctx.request;
  ctx.assert(body, 400, 'Empty body');

  const map = {
    structure: (v) => v,
    meta: (v) => v,
    public: (v) => {
      ctx.assert(typeof v === 'boolean', 400, '"public" should be a boolean');
      return v;
    },
    partnerScriptCategoryId: async (val) => {
      if (val === null) {
        return null;
      }
      const category = await ctx.db.PartnerScriptCategory.findByPk(val);
      ctx.assert(category, 400, 'Unknown category id');
      return val;
    },
  };

  const values = await Promise.all(
    Object.entries(map)
      .filter(([key]) => key in body)
      .map(async ([key, func]) => {
        const value = await func(body[key]);
        return [key, value];
      }),
  );

  const result = {};
  for (const [key, value] of values) {
    result[key] = value;
  }
  return result;
}
