// chalk используется повсеместно для окраски логов
const chalk = require('chalk');

// intel используется для логов вообще
const intel = require('intel');

// Основной конфиг приложения
const conf = require('../config').app;

// Импортирую версию приложения для фиксации этого в Sentry
process.env.APP_VERSION = require('../package.json').version;

// Добавляю стандартный хендлер
intel.addHandler(new intel.handlers.Console({
  formatter: new intel.Formatter(conf.formatterOptions),
}));

intel.info('Launching app...');

// Модуль обновления токена для AMOCRM
const amoToken = require('./tools/amo-token');

// Модуль для очистки старых данных и освобождения места
const cleaning = require('./tools/cleaning');

// Модуль для обновлений статистики аккаунтов в amoCRM
const amoMonitoring = require('./amoCRM/monitoring');

// Модуль для переноса дедлайнов аккаунтов
const accountDeadlines = require('./tools/account-deadlines');

// Модуль для работы с ключами для входа пользователей
const entries = require('./tools/entries');

// Модуль для подсчета записей
const savedRecords = require('./tools/saved-records');

// Основной сервер
const server = require('./app');

// База данных
const db = require('../data/models');

const port = process.env.PORT || 3000;

// Синхронизируюсь с БД
db.sequelize.sync().then(() => {
  // // Задачи по отчётам
  // reports.setup();

  // первичная проверка токена
  amoToken.setup();

  // Настройка периодической очистки
  cleaning.setup();

  // Настройка обновления статистики
  amoMonitoring.setup();

  // Настройка переноса дедлайнов
  accountDeadlines.setup();

  // Настройка удаления старых Entry
  entries.setup();

  // запуск пересчета занятых записей
  savedRecords.setup();

  // Начинаю слушать порт, приложение готово к работе
  server.listen(port);
  intel.info(`Server listening on port ${chalk.blue.bold(port)}`);
});
