const hash = require('../../tools/hashing');
const jwt = require('jsonwebtoken');
const config = require('../../../config');
const entries = require('../../tools/entries');

const PATH = '/users';

module.exports = [
  {
    method: 'get',
    path: PATH,
    // Получение пользователей
    async handler(ctx) {
      const data = await ctx.db.User.findAll();
      ctx.body = data.map((x) => {
        const keys = 'id name role username accountId params'.split(' ');
        const result = {};
        keys.forEach((key) => { result[key] = x.dataValues[key]; });
        return result;
      });
    },
  },
  {
    method: 'put',
    path: PATH,
    // Добавления пользователя
    async handler(ctx) {
      try {
        const { id } = await ctx.db.User.create({
          ...ctx.request.body,
          passwordHash: hash(ctx.request.body.password),
        });
        ctx.body = { id };
      } catch (e) {
        ctx.throw(400);
      }
    },
  },
  {
    method: 'patch',
    path: PATH,
    // Изменение пользователя
    async handler(ctx) {
      const item = await ctx.db.User.findByPk(ctx.query.id);
      ctx.assert(item, 404, 'User not found');
      const data = ctx.request.body;
      await ctx.memory.update.user(item, data);
      ctx.status = 204;
    },
  },
  {
    method: 'delete',
    path: PATH,
    // Удаление пользователя
    async handler(ctx) {
      const item = await ctx.db.User.findByPk(ctx.query.id);
      ctx.assert(item, 404, 'User not found');
      await ctx.memory.destroyUser(item);
      ctx.status = 204;
    },
  },
  {
    method: 'post',
    path: '/auth-as',
    /**
     * Получение токена данного пользователя
     */
    async handler(ctx) {
      let user = await ctx.db.User.findByPk(ctx.query.id);
      if (!user.jwtIat) {
        await ctx.memory.setSignJwt(user);
        user = await ctx.db.User.findByPk(ctx.query.id);
      }
      const payload = {
        uid: user.id,
        iat: user.jwtIat,
      };
      const token = jwt.sign(payload, config.app.secret);
      ctx.body = { token };
    },
  },
  {
    method: 'post',
    path: '/generate-entry',
    /**
     * Генерация ключа для входа пользователя
     */
    async handler(ctx) {
      const user = await ctx.db.User.findByPk(ctx.query.id);
      const key = await entries.makeEntryKey(user.id);
      ctx.body = { key };
    },
  },
];
