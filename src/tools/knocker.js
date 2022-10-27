const axios = require('axios').default;
const chalk = require('chalk');
const logger = require('intel').getLogger('knocker');

const enabled = +process.env.KNOCK === 1;
logger.info(`Knocking ${enabled ? chalk.green.bold('enabled') : chalk.red.bold('disabled')}`);

/**
 * "Тревожная кнопка" для разработчика (меня) на критичные случаи.
 * Отсылает текстовое сообщение на определённый адреc, с которого
 * потом приходит уведомление разработчику (мне).
 *
 * @param {String} text - Текстовое сообщение
 */
function knock(text) {
  enabled && axios.post(
    'https://secure-cliffs-29509.herokuapp.com/knock-knock',
    text,
    {
      headers: {
        'content-type': 'text/plain',
      },
    },
  ).then(() => {
    logger.info('Knock ok');
  }).catch((e) => {
    logger.debug('Knock not ok', e);
  });
}

module.exports = { knock };
