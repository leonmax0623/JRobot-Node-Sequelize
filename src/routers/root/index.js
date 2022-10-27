const Router = require('koa-router');
const logger = require('intel').getLogger('root-api');
const jwt = require('jsonwebtoken');
const db = require('../../../data/models');
const conf = require('../../../config');
const hash = require('../../tools/hashing');

/**
 * @type {{ method: string, path: string, handler: Function|Promise }[]}
 */
const routes = [
  // роуты авторизации
  ...require('./auth'),

  // роуты работы с аккаунтами
  ...require('./accounts'),

  // роуты работы с пользователями
  ...require('./users'),

  // работа со сценариями
  ...require('./scripts'),

  // работа с категориями сценариев
  ...require('./script_categories'),

  // информация по подключениям текущим к тренажёру
  ...require('./connections'),

  // правка общих данных (PaymentRates, PartnerScriptCategories)
  ...require('./tuning'),

  // Работа с сессиями
  ...require('./sessions'),

  // Работа с MonitoringEvents
  ...require('./dashboard'),

  // Просмотр статистики синтеза
  ...require('./tts'),

  // Работа с фидбеками
  ...require('./feedbacks'),

  // Работа с репортами
  ...require('./reports'),
];

/**
 * Рутовский роутер (root, корневой пользователь, админ JRobot)
 */
const router = new Router({
  prefix: '/root',
});

router.use(async (ctx, next) => {
  // Аутентификация не работает для роутов
  // /secret и /token
  // Они используются для авторизации, публичны как бы
  if (!/^\/root\/(secret|token|download-report)$/.test(ctx.path)) {
    await authenticate(ctx);
  }
  await next();
});

routes.forEach(({ method, path, handler }) => {
  // console.log('Root route:', method.toUpperCase(), path)
  router[method](path, handler);
});

module.exports = router;

/**
 * Аутентификация через токен. Если не пройдено - ошибка
 */
async function authenticate(ctx) {
  try {
    const tokenHeader = ctx.request.header.authorization;
    const token = tokenHeader.match(/JWT (.+)/)[1];
    const rootUser = await verifyToken(token, ctx.request.ip);
    ctx.state.root = rootUser;
  } catch (e) {
    logger.debug('Root authorization failed:', e.message);
    ctx.throw(401);
  }
}

/**
 * Проверка токена рута
 * @param {string} token
 * @param {string} ip
 * @returns {any} Информация о руте
 */
function verifyToken(token, ip) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, conf.root.jwtSecret, (err, payload) => {
      if (err) {
        reject(err);
      } else {
        const { usr, iph } = payload;
        if (hash(ip) !== iph) {
          reject(new Error('ip verify failed'));
          return;
        }
        db.Root.findOne({ where: { username: usr } }).then((root) => {
          if (!root) {
            reject(new Error('root not found'));
          }
          resolve(root);
        });
      }
    });
  });
}
