const GROUPS = '/groups';
const GROUP_SCRIPT = '/group-script';

module.exports = [
  {
    path: GROUPS,
    method: 'get',
    /**
     * Получение групп
     */
    async handler(ctx) {
      allowedOnlyForAdmin(ctx);
      ctx.body = await ctx.memory.select(`
        select id, name
        from "Groups"
        where "accountId" = ${ctx.state.user.accountId}
      `);
    },
  },
  {
    path: GROUPS,
    method: 'put',
    /**
     * Добавление группы
     */
    async handler(ctx) {
      allowedOnlyForAdmin(ctx);
      const group = await ctx.db.Group.create({
        accountId: ctx.state.user.accountId,
        name: ctx.request.body.name,
      });
      ctx.body = { id: group.id };
      ctx.status = 201;
    },
  },
  {
    path: GROUPS,
    method: 'patch',
    /**
     * Изменение имени группы
     */
    async handler(ctx) {
      allowedOnlyForAdmin(ctx);
      const [affected] = await ctx.db.Group.update(
        {
          name: ctx.request.body.name,
        },
        {
          where: {
            accountId: ctx.state.user.accountId,
            id: ctx.query.id,
          },
        },
      );
      ctx.assert(affected, 404, 'No updated groups');
      ctx.status = 204;
    },
  },
  {
    path: GROUPS,
    method: 'delete',
    /**
     * Удаление группы
     */
    async handler(ctx) {
      allowedOnlyForAdmin(ctx);
      const destroyed = await ctx.db.Group.destroy({
        where: {
          accountId: ctx.state.user.accountId,
          id: ctx.query.id,
        },
      });
      ctx.assert(destroyed, 404, 'No destoyed groups');
      ctx.status = 204;
    },
  },
  {
    path: GROUP_SCRIPT,
    method: 'get',
    /**
     * Получение связей группа-сценарий
     */
    async handler(ctx) {
      allowedOnlyForAdmin(ctx);
      const conditions = [
        `g."accountId" = ${ctx.state.user.accountId}`,
      ];
      if ('scriptId' in ctx.query) {
        conditions.push(`gs."scriptId" = ${ctx.query.scriptId}`);
      }
      if ('groupId' in ctx.query) {
        conditions.push(`g.id = ${ctx.query.groupId}`);
      }
      ctx.body = await ctx.memory.select(`
        select "groupId", "scriptId"
        from
          "GroupScript" gs
          join
          "Groups" g on gs."groupId" = g.id
        where ${conditions.join(' and ')}
      `);
    },
  },
  {
    path: GROUP_SCRIPT,
    method: 'put',
    /**
     * Добавление связи группа-сценарий
     */
    async handler(ctx) {
      allowedOnlyForAdmin(ctx);
      const { groupId, scriptId } = ctx.query;
      const group = await ctx.db.Group.findOne({
        where: {
          id: groupId,
          accountId: ctx.state.user.accountId,
        },
      });
      ctx.assert(group, 404, 'Group not found');
      try {
        await group.addScript(scriptId);
      } catch (e) {
        ctx.throw(404, 'Association already exists?');
      }
      ctx.status = 204;
    },
  },
  {
    path: GROUP_SCRIPT,
    method: 'delete',
    /**
     * Удаление связи группа-сценарий
     */
    async handler(ctx) {
      allowedOnlyForAdmin(ctx);
      const { groupId, scriptId } = ctx.query;
      const group = await ctx.db.Group.findOne({
        where: {
          id: groupId,
          accountId: ctx.state.user.accountId,
        },
      });
      ctx.assert(group, 404, 'Group not found');
      const removed = await group.removeScript(scriptId);
      ctx.assert(removed, 404, 'Association has not already exists?');
      ctx.status = 204;
      // if (removed) {
      //   ctx.status = 204
      // } else {
      //   ctx.throw(404, 'Association has not already exists?')
      // }
    },
  },
  {
    path: '/script-groups',
    method: 'get',
    /**
     * Получение групп сценария
     */
    async handler(ctx) {
      allowedOnlyForAdmin(ctx);

      ctx.assert(!isNaN(+ctx.query.id), 400, 'Invalid id in query (or not provided)');

      const data = await ctx.memory.select(`
        select "Groups".id id
        from
          "Groups"
          join "GroupScript" on "GroupScript"."groupId" = "Groups".id
        where
          "Groups"."accountId" = ${ctx.state.user.accountId}
          and "GroupScript"."scriptId" = ${ctx.query.id}
      `);
      ctx.body = data.map(({ id }) => id);
    },
  },
  {
    path: '/script-groups',
    method: 'patch',
    /**
     * Установка групп для сценария
     */
    async handler(ctx) {
      allowedOnlyForAdmin(ctx);

      ctx.assert(Array.isArray(ctx.request.body), 400, 'Invalid body (must be an array of ids)');
      const groups = await ctx.db.Group.findAll({
        where: {
          accountId: ctx.state.account.id,
          id: { [ctx.memory.Op.in]: ctx.request.body },
        },
      });
      ctx.assert(groups.length === ctx.request.body.length, 403, 'Some groups not allowed');

      ctx.assert(!isNaN(+ctx.query.id), 400, 'Invalid id');
      const script = await ctx.db.Script.findByPk(ctx.query.id);
      ctx.assert(script, 404, 'Script not found');

      if (script.accountId === ctx.state.account.id) {
        await script.setGroups(groups.map(({ id }) => id));
      } else {
        const account = await ctx.db.Account.findByPk(script.accountId);
        ctx.assert(account.partner, 404, 'Script not found');

        await ctx.db.sequelize.transaction(async () => {
          await ctx.db.sequelize.query(`
            delete from "GroupScript"
            where
              "scriptId" = ${script.id}
              and "groupId" in (
                select id
                from "Groups"
                where "accountId" = ${ctx.state.account.id}
              )
          `);

          if (groups.length) {
            const values = groups.map(({ id }) => `(now(), now(), ${script.id}, ${id})`);
            await ctx.db.sequelize.query(`
              insert into "GroupScript"
              ("createdAt", "updatedAt", "scriptId", "groupId")
              values ${values.join(', ')}
            `);
          }
        });
      }

      ctx.status = 204;
    },
  },
];

function allowedOnlyForAdmin(ctx) {
  ctx.assert(ctx.state.user.role === 'admin', 403, 'Allowed only for admin!');
}
