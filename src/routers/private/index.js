const Router = require('koa-router');
const jwt = require('jsonwebtoken');
const config = require('../../../config');
// const auth = require('../../auth');

/**
 * Основной пользовательский (приватный) роутер
 */
const router = new Router();

// Middleware аутентификации
router.use(async (ctx, next) => {
  let tokenPayload;

  // Изъятие токена
  try {
    const [, token] = ctx.request.header.authorization.split(' ');

    tokenPayload = await new Promise((resolve, reject) => {
      const options = { ignoreExpiration: true };
      jwt.verify(token, config.app.secret, options, async (err, payload) => (
        err ? reject(err) : resolve(payload)
      ));
    });
  } catch (e) {
    ctx.throw(401, e.message);
  }

  // Нахождение пользователя, проверка
  const { uid, iat } = tokenPayload;
  const user = await ctx.db.User.findByPk(+uid);
  ctx.assert(user, 401, 'user_not_found');
  ctx.assert(user.jwtIat === iat, 401, 'invalid_iat');

  // Нахождение аккаунта
  const account = await ctx.db.Account.findByPk(+user.accountId);
  ctx.assert(account, 401, 'account_not_found');

  // Установка данных в состояние контекста
  ctx.state.account = account;
  ctx.state.user = user;

  return next();
});

router.use(async (ctx, next) => {
  if (ctx.state.account.partner) {
    // Запретить некоторые роуты партнёрскому аккаунту
    // Разрешено -- profile, scripts, account-name, duplicate-script, restore-script
    const allowedPathes = [
      'scripts',
      'profile',
      'account-name',
      '(duplicate|restore)-script',
      'partner-script-categories',
      'partner-stats',
    ];
    const allowedRegExp = new RegExp(`^/(${allowedPathes.join('|')})$`);
    if (!allowedRegExp.test(ctx.path)) {
      ctx.throw(403, 'not_allowed_for_partner_account');
    }
  }
  return next();
});

/**
 * @type {{ method: string, path: string, handler: Function|Promise }[]}
 */
const routes = [
  // Работа с пользователями
  ...require('./users'),
  // Работа с профилем
  ...require('./profile'),
  // Работа с группами
  ...require('./groups'),
  // Работа со сценариями
  ...require('./scripts'),
  // Работа с аккаунтом
  ...require('./account'),
  // Статистика
  ...require('./stats'),
  // История сессий (записи)
  ...require('./history'),
  // Роут для фидбека
  ...require('./feedbacks'),
];

routes.forEach(({ method, path, handler }) => {
  router[method](path, handler);
});

module.exports = router;
