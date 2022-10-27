const jwt = require('jsonwebtoken');
const logger = require('intel').getLogger('root-api-auth');
const db = require('../../../data/models');
const conf = require('../../../config');
const { password } = require('../../tools/random');
const hash = require('../../tools/hashing');
const mailer = require('../../tools/mailer');

const routes = [];
module.exports = routes;

async function sendSecretToRoot(root, secret) {
  await mailer.sendMail({
    to: root.dataValues.email,
    subject: 'Одноразовый пароль',
    html: `<h1><code>${secret}</code></h1>`,
  });
}

module.exports = [
  {
    method: 'post',
    path: '/secret',
    /**
     * Запрос на отправку пароля на почту
     */
    async handler(ctx) {
      const { username } = ctx.request.body;
      ctx.assert(username, 400, 'No username in body');
      const root = await db.Root.findOne({ where: { username } });
      ctx.assert(root, 404, 'Root not found');
      const secret = await password(10);
      root.set('secret', secret);
      await root.save();
      if (process.env.NODE_ENV === 'production') {
        await sendSecretToRoot(root, secret);
        ctx.status = 204;
      } else {
        ctx.body = { secret };
        logger.info(secret);
      }
    },
  },
  {
    method: 'post',
    path: '/token',
    /**
     * Получение рутовского токена через пароль, отправленный на почту
     */
    async handler(ctx) {
      const { username, secret } = ctx.request.body;
      ctx.assert(username && secret, 400, 'No username or secret');
      const root = await db.Root.findOne({ where: { username } });
      ctx.assert(root, 404, 'Root not found');
      ctx.assert(root.dataValues.secretHash, 400, 'Request not awaiting');
      ctx.assert(root.dataValues.secretHash === hash(secret), 400, 'Invalid secret');
      root.set('ip', ctx.request.ip);
      root.secretHash = '';
      await root.save();
      const token = jwt.sign(
        {
          iph: root.dataValues.ipHash,
          usr: root.dataValues.username,
        },
        conf.root.jwtSecret,
        { expiresIn: '7d' },
      );
      logger.info('New root token signed. IP:', ctx.request.ip);
      ctx.body = { jwt: token };
    },
  },
];
