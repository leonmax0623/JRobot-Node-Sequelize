const logger = require('intel').getLogger('entry-link');
const chalk = require('chalk');
const entries = require('./entries');

const HOST = process.env.HOST || 'https://app.jrobot.pro';
logger.info('Host:', chalk.magenta(HOST));

/**
 * Создаёт пользователю ссылку для входа
 *
 * - `userId` - id пользователя
 * - `fromRegistration` - если да, то добавляет параметр (который активирует онбординг на фронте)
 *
 * @returns {Promise<string>} Ссылка для входа
 */
async function makeEntryLink({
  userId, fromRegistration = false, login = '', token = '',
}) {
  const key = await entries.makeEntryKey(userId);
  const params = [`key=${key}`];
  fromRegistration && params.push('reg=1');
  login && params.push(`login=${login}`);
  token && params.push(`token=${token}`);
  return `${HOST}/entry?${params.join('&')}`;
}

module.exports = { makeEntryLink };
