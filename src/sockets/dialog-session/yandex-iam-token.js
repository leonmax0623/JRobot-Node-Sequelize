const chalk = require('chalk');
const io = require('socket.io-client');
const logger = require('intel').getLogger('iam');

const PORT = process.env.IAM_PORT || 3025;
const WORKING = process.env.TTS !== 'google';
const socket = io(`http://localhost:${PORT}`, {
  autoConnect: process.env.NODE_ENV !== 'test' && WORKING,
});
if (WORKING) {
  logger.info(`iam-service port: ${chalk.blue.bold(PORT)}`);
} else {
  logger.info(chalk`{grey Not working because of} TTS = google`);
}

let token = '';

socket.on('connect', () => {
  logger.info(`${chalk.bold.green('===')} Service connected`);
  // Запрашиваю токен сразу
  socket.emit('get-token');
});

socket.on('disconnect', () => {
  logger.info(`${chalk.bold.red('=/=')} Service disconnected`);
});

socket.on('token', (data) => {
  logger.info('Token received, updating local token');
  // Сохраняю новый токен
  token = String(data.token).trim();
});

/**
 * Модуль синхронизации с внешним сервисом токена
 */
module.exports = {
  /**
   * Взятие токена
   */
  getToken: () => token,
  /**
   * Принудительное обновление токена прямо сейчас
   */
  updateToken() {
    logger.info('Requesting newest token from service');
    socket.emit('get-newest-token');
  },
};
