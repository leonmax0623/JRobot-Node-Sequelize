const Sentry = require('@sentry/node');
const Koa = require('koa');
const http = require('http');
const helmet = require('koa-helmet');
const session = require('koa-session');
// const bodyparser = require('koa-bodyparser');
// const multer = require('koa-multer');
// const betterBody = require('koa-better-body');
// const convert = require('koa-convert');
const body = require('koa-body');

const rootRouter = require('./routers/root');
const publicRouter = require('./routers/public');
const privateRouter = require('./routers/private');
const logger = require('./middleware/logger');
const config = require('../config');
const appLogger = require('intel').getLogger('app');

const app = new Koa();

app.keys = ['zDwd7NgYVDCmLBkMLTHuhMH64Tcg24p5'];

const SESSION_CONFIG = {
  key: 'jrobot.sess',
  maxAge: 86400000,
  autoCommit: true,
  overwrite: true,
  signed: true,
  rolling: false,
  renew: false,
  secure: (app.env === 'production'),
  sameSite: null,
};

app.use(session(SESSION_CONFIG, app));

// Добавляю некоторые поля для удобства обращения потом
// через ctx.memory, ctx.mailer etc
app.context.memory = require('./tools/memory');
app.context.mailer = require('./tools/mailer');

app.context.logger = appLogger;
app.context.db = app.context.memory.db;

// Приложение работает через NGINX, сообщаю об этом koa
app.proxy = true;

if (app.env === 'production') {
  // Не слишком знаю, зачем нужно, но нужно.
  app.use(helmet());

  // Sentry integration
  Sentry.init({
    dsn: config.sentryDSN,
    release: `yumajs@${process.env.APP_VERSION}`,
    environment: process.env.HOST,
  });

  app.on('error', (err, ctx) => {
    // Если случилась непредвиденная ошибка, доложить в Sentry об этом
    if (!err.expose) {
      appLogger.error(err);
      Sentry.withScope((scope) => {
        if (ctx.state.user) {
          const { id, username } = ctx.state.user;
          scope.setUser({ id, username, email: username });
        }
        // scope.setTags({
        //   host: process.env.HOST,
        // });
        scope.addEventProcessor((event) => Sentry.Handlers.parseRequest(event, ctx.request));
        Sentry.captureException(err);
      });
    }
  });
}

if (app.env !== 'test') {
  app.use(logger);
}

app.use(body({
  multipart: true,
}));

// // Парсинг multipart/form-data
// app.use(multer().any());

// // middleware для парсинга тела запроса
// app.use(bodyparser());

// Самыми последними добавляю все роутеры
app.use(publicRouter.routes());
app.use(privateRouter.routes());
app.use(rootRouter.routes());
app.use(publicRouter.allowedMethods());

// Создаю сервер
const server = http.createServer(app.callback());
// Присоединяю к нему socket.io сервер
require('./sockets').attachToServer(server);

// Экспортирую подготовленный сервер для работы в продовом или тестовом режимах
module.exports = server;
