const amoHooks = require('../../amoCRM/hooks');
const monitoringEvents = require('../../tools/monitoring-events');
const mailer = require('../../tools/mailer');
const random = require('../../tools/random');

const PATH = '/users';

module.exports = [
  {
    path: PATH,
    method: 'get',
    /**
     * Получение списка пользователей.
     * Администратору - все вообще.
     * Менеджеру - пользователи его группы.
     */
    async handler(ctx) {
      const { role, accountId, groupId } = ctx.state.user;
      if (role === 'admin') {
        ctx.body = await ctx.memory.select(`
          select id, regexp_replace(name, '(^\\s*|\\s*$)', '', 'g') "name", username, role, "groupId"
          from "Users"
          where "accountId" = ${accountId}
        `);
      } else if (role === 'manager') {
        ctx.assert(groupId, 403, 'Not allowed for manager out of groups');
        ctx.body = await ctx.memory.select(`
          select id, regexp_replace(name, '(^\\s*|\\s*$)', '', 'g') "name", username, role
          from "Users"
          where
            "accountId" = ${accountId}
            and "groupId" = ${groupId}
        `);
      } else {
        ctx.throw(403, 'Not allowed for students');
      }
    },
  },
  {
    path: PATH,
    method: 'put',
    /**
     * Добавление нового пользователя
     */
    async handler(ctx) {
      const { accountId } = ctx.state.user;
      const account = await ctx.db.Account.findByPk(accountId);
      ctx.assert(account, 404, 'Account not found');

      // проверить лимит аккаунта по пользователям
      if (account.usersLimit !== 0) {
        const currentUsersCount = await ctx.db.User.count({ where: { accountId } });
        ctx.assert(currentUsersCount + 1 <= account.usersLimit, 403, 'users_limit_reached');
      }

      const {
        username, password, role, name,
      } = ctx.request.body;
      ctx.assert(role && password && username, 400, 'Some of values is empty');
      ctx.assert(['manager', 'student', 'admin'].includes(role), 400, `Invalid role: ${role}`);
      ctx.assert(!(await ctx.memory.findUserByUsername(username)), 400, 'username_already_exists');

      let user = null;
      switch (ctx.state.user.role) {
        case 'admin': {
          const { groupId = null } = ctx.request.body;
          if (groupId) {
            if (!(await ctx.db.Group.findOne({ where: { id: groupId, accountId } }))) {
              ctx.throw(403, 'Group is not yours!');
            }
          }
          user = await ctx.memory.create.user({
            role,
            username,
            name,
            password,
            accountId,
            groupId,
          });
          break;
        }
        case 'manager': {
          const { groupId } = ctx.state.user;
          ctx.assert(groupId, 403, 'Not allowed for manager out of groups');
          // ctx.assert(!role || role === 'student', 403, 'Allowed only creating of students')
          user = await ctx.memory.create.user({
            role: 'student',
            username,
            name,
            password,
            accountId,
            groupId,
          });
          break;
        }
        default: {
          ctx.throw(403, 'Allowed only for manager or admin!');
          break;
        }
      }
      ctx.body = { id: user.id };
      ctx.status = 201;
      await Promise.all([
        ctx.mailer.inviteUser(user, account, password),
        amoHooks.userCreated(ctx.state.user),
        ctx.db.MonitoringEvent.create({
          type: monitoringEvents.types.USER_CREATED,
          extra: {
            accountId: account.id,
            userId: ctx.state.user.id,
            createdUserId: user.id,
          },
        }),
      ]);
      // await ctx.mailer.inviteUser(user, account, password);
      // await amoHooks.userCreated(ctx.state.user);
    },
  },
  {
    path: PATH,
    method: 'patch',
    /**
     * Редактирование пользователя
     */
    async handler(ctx) {
      const data = ctx.request.body;
      if (['role', 'username', 'name', 'password', 'groupId'].every(
        (prop) => !(prop in data),
      )) {
        ctx.throw(400, 'no_data');
      }

      if ('password' in data && !data.password) {
        ctx.throw(400, 'empty_password');
      }
      if ('username' in data && await ctx.memory.findUserByUsername(data.username)) {
        ctx.throw(400, 'username_already_exists');
      }
      let user = null;
      switch (ctx.state.user.role) {
        case 'admin': {
          const { id } = ctx.query;
          const { accountId } = ctx.state.user;
          user = await ctx.db.User.findOne({
            where: { id, accountId },
          });
          ctx.assert(
            user.id - ctx.state.user.id !== 0 || !('role' in data),
            403,
            'Patching own admin role is not allowed!',
          );
          break;
        }
        case 'manager': {
          ctx.assert(!('groupId' in data), 403, 'Patching of groupId allowed only for admin');
          ctx.assert(!('role' in data), 403, 'Patching role allowed only for admin');
          const { id } = ctx.query;
          const { groupId } = ctx.state.user;
          ctx.assert(groupId, 403, 'Not allowed for manager out of groups');
          user = await ctx.db.User.findOne({
            where: { id, groupId },
          });
          ctx.assert(user, 404, 'User not found');
          ctx.assert(user.role !== 'admin', 403, 'Manipulations with admin');
          break;
        }
        default: {
          ctx.throw(403, 'Allowed only for admin and manager');
        }
      }
      await ctx.memory.update.user(user, data, true);
      ctx.status = 204;
    },
  },
  {
    path: PATH,
    method: 'delete',
    /**
     * Удаление пользователя
     */
    async handler(ctx) {
      let user = null;
      switch (ctx.state.user.role) {
        case 'admin': {
          user = await ctx.db.User.findOne({
            where: {
              accountId: ctx.state.user.accountId,
              id: ctx.query.id,
            },
          });
          break;
        }
        case 'manager': {
          const { groupId } = ctx.state.user;
          ctx.assert(groupId, 403, 'Not allowed for manager out of groups');
          user = await ctx.db.User.findOne({
            where: {
              groupId,
              id: ctx.query.id,
            },
          });
          ctx.assert(user, 404, 'User not found');
          ctx.assert(user.role !== 'admin', 403, 'Manipulations with admin');
          break;
        }
        default: {
          ctx.throw(403, 'Allowed only for manager and admin');
        }
      }
      ctx.assert(user, 404, 'User not found');
      ctx.assert(user.id - ctx.state.user.id !== 0, 403, 'Selfharm is forbidden!');
      await ctx.memory.destroyUser(user);
      ctx.status = 204;
    },
  },
  {
    method: 'post',
    path: '/generate-users',
    /**
     * Генерация пачки новых пользователей
     * @typedef {{ username: string, role: string }[]} GenerateUsersBody
     * @param {{ request: { body: GenerateUsersBody } }} ctx
     */
    async handler(ctx) {
      ctx.assert(ctx.state.user.role === 'admin', 403, 'Allowed only for admin');
      ctx.assert(ctx.request.body.length, 400, 'no_data');
      ctx.request.body.forEach((val) => {
        if (val.username && !['admin', 'manager', 'student'].includes(val.role)) {
          ctx.throw(400, `Invalid role: "${val.role}"`);
        }
      });

      const created = [];
      const failed = [];

      await Promise.all(ctx.request.body.map(async ({ username, role }) => {
        if (username) {
          try {
            await ctx.db.sequelize.transaction(async () => {
              const password = await random.password(8);
              const user = await ctx.memory.create.user({
                role,
                username,
                password,
                accountId: ctx.state.account.id,
              });
              await mailer.inviteUser(user, ctx.state.account, password);
            });

            created.push(username);
          } catch (err) {
            ctx.logger.debug(`Error while generating user "${username}":`, err);
            failed.push(username);
          }
        }
      }));

      ctx.status = 200;
      ctx.body = { created, failed };
    },
  },
];
