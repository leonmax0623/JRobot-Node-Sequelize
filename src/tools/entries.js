const uuidv4 = require('uuid/v4');
const assert = require('assert');
const logger = require('intel').getLogger('entries');
const memory = require('./memory');
const config = require('../../config');
const cron = require('./cron');

const { db } = memory;
const expirationMs = stringToMs(config.app.entryExpiresIn);

// const HOST = process.env.HOST || 'https://app.jrobot.pro';
// logger.info('Host:', chalk.magenta(HOST));

/**
 * Настройка удаления старых entry
 */
function setup() {
  cron.schedule(config.crons.entriesClearingCron, async () => {
    try {
      logger.info('Clearing old entries...');
      const count = await clearOldEntries();
      logger.info('Done. Count:', count);
    } catch (err) {
      logger.debug('Clearing error:', err);
    }
  });

  logger.info('Clearing job sheduled');
}

/**
 * Создаёт ключ для входа пользователя
 *
 * @param {Number|String} userId Пользователь, для которого будет (пере-)создан ключ
 * @returns {Promise<string>} Ссылка для входа
 */
async function makeEntryKey(userId) {
  // Формирование уникального ключа
  let uuid = uuidv4();

  // Проверка, чтобы ну точно не было уже таких ключей
  /* eslint-disable-next-line no-await-in-loop */
  while (await db.Entry.findByPk(uuid)) {
    uuid = uuidv4();
  }

  // Создание записи в базе
  await db.Entry.create({
    uuid,
    userId,
  });

  // Для отладки
  if (process.env.NODE_ENV === 'development') {
    logger.debug('New entry generated. ID = %s', uuid);
  }

  return uuid;
}

/**
 * Проверяет ключ и, в случае его корректности, выдаёт токен на пользователя
 *
 * @param {string} key - uuid Entry
 * @returns {Promise<string>} jwt-токен
 */
async function useEntryKey(key) {
  const entry = await db.Entry.findByPk(key);
  assert(entry, 'Entry not found');
  const expireDate = computeExpireDate();
  assert(entry.createdAt >= expireDate, 'Entry expired');
  const { userId } = entry;
  assert(userId, 'Entry has not userId');
  const user = await db.User.findByPk(userId);
  assert(user, `User not found (${userId})`);

  // Всё ок, можно делать токен
  const token = await memory.setSignJwt(user);

  return token;
}

async function clearOldEntries() {
  const expireDate = computeExpireDate();
  const deletedCount = await db.Entry.destroy({
    where: {
      createdAt: {
        [memory.Op.lt]: expireDate,
      },
    },
  });
  return deletedCount;
}

/**
 * Преобразует время в формате '7d 5h 3w' в миллисекунды
 * @param {string} time
 * @returns {number}
 */
function stringToMs(time) {
  const hour = 3600 * 1e3;
  const day = hour * 24;
  const week = day * 7;
  const month = day * 30;
  const factors = {
    w: week,
    d: day,
    h: hour,
    M: month,
  };
  return time.split(/ +/).reduce((ms, rule) => {
    const [, count, period] = rule.match(/(\d+)(\w+)/);
    const factor = factors[period] || 0;
    return ms + (+count * factor);
  }, 0);
}

/**
 * @returns {Date}
 */
function computeExpireDate() {
  return new Date(Date.now() - expirationMs);
}

/**
 * Модуль отвечает за ключи входа пользователей без пароля
 */
module.exports = {
  setup,
  makeEntryKey,
  useEntryKey,
};
