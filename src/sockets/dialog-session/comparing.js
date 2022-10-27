const logger = require('intel').getLogger('compare');
const io = require('socket.io-client');
const chalk = require('chalk');
const knocker = require('../../tools/knocker');

const PORT = process.env.COMPARE_PORT || 10218;

const socket = io(`http://localhost:${PORT}`, {
  // Исключает подключение при тестах
  autoConnect: process.env.NODE_ENV !== 'test',
});
logger.info(`Compare port: ${chalk.blue.bold(PORT)}`);

socket.on('connect', () => {
  logger.info(`${chalk.green.bold('===')} Service connected`);
});

socket.on('disconnect', () => {
  logger.info(`${chalk.red.bold('=/=')} Service disconnected`);
});

/**
 * Отправляет запрос в сервис семантического сравнения предложений
 *
 * @param {string} source - эталонный текст
 * @param {string} attempt - текст, который нужно сравнить
 * @param {number} loyality - чувствительность (от 0.1 до 1.0)
 * @param {number} timeout - таймаут запроса
 * @returns {Promise<boolean>} - Да/нет, похож/не похож
 */
function isSimilar(source, attempt, loyality, timeout = null) {
  let promiseDone = false;
  return new Promise((resolve, reject) => {
    // Для отладки
    if (process.env.NODE_ENV !== 'production' && !socket.connected) {
      logger.info(chalk.cyan.underline('NO PROD, NO CONNECTION - TRUE!'));
      resolve(true);
    }

    // Подключения с сервисом нет, ошибка
    if (!socket.connected) {
      logger.debug('Compare service disconnected, so comparing is unavailable');
      knocker.knock('[compare] Compare service disconnected');
      reject(new Error('disconnected'));
    }

    // Указан таймаут -> устанавливаю таймаут подключения
    if (timeout) {
      setTimeout(() => {
        // Проверка, не получен ли уже ответ
        if (!promiseDone) {
          logger.debug(`Compare timeout (ms - ${timeout})`);
          knocker.knock(`[compare] Timeout! (value = ${timeout})`);
          reject(new Error('timeout'));
        }
      }, timeout);
    }

    // Отправляю запрос на сравнение
    socket.emit('is similar', { source, attempt, loyality }, (result) => {
      if (result && typeof result === 'object') {
        if ('similar' in result) {
          // Всё ок, сервис сработал и дал ответ
          resolve(!!result.similar);
          return;
        }
        if ('error' in result) {
          // Случилась ошибка
          logger.debug('Compare internal error:', result.error);
          knocker.knock(`[compare] Internal error: ${result.error}`);
          reject(new Error('internal'));
          return;
        }
      }
      // Результат какой-то кривой, ошибка
      logger.debug('Undefined compare result:', result);
      knocker.knock('[compare] Undefined result, see logs');
      reject(new Error('internal'));
    });
  }).finally(() => {
    // Ставлю флаг для корректного отслеживания таймаута запроса
    promiseDone = true;
  });
}

module.exports = { isSimilar };
