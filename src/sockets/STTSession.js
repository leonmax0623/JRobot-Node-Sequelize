const WebSocket = require('ws');
const chalk = require('chalk');
const Sentry = require('@sentry/node');
const logger = require('intel').getLogger('stt-session');

const memory = require('../tools/memory');
const { verify } = require('./auth');

const STT_PORT = process.env.STT_PORT || 2700;
const STT_HOST = `ws://localhost:${STT_PORT}`;
logger.info(chalk`Streaming recognition port: {blue.bold ${STT_PORT}}`);

// Класс для работы сессии серверного распознавания речи

module.exports = class {
  /**
   * @param {SocketIO.Socket} socket
   */
  constructor(socket) {
    // Сокет пользователя
    this._socket = socket;
    /**
     * Сокет kaldi
     * @type {WebSocket}
     */
    this._ws = new WebSocket(STT_HOST);
    this._ws.on('open', async () => {
      this._logInfo('Started');
      // await this.setup();
    });
    this._ws.on('message', message => {
      this._wsMessage(message);
    });
    this._lastResult = '';
  }

  async setup() {
    // Авторизация
    let user;
    try {
      const { token } = this._socket.handshake.query;
      user = await verify(token);
    } catch (e) {
      throw new Error(`Authorization error: "${e.message}"`);
    }

    // Проверка доступности распознавания для аккаунта
    const account = await memory.db.Account.findByPk(user.accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    // Все полученные чанки данных прямо отправляем в текущий вебсокет
    this._socket.on('speech-chunk', (data) => {
      this._ws.send(data);
    });
  }

  // Получение сообщения от kaldi
  _wsMessage(message) {
    let data;
    try {
      // Для начала его нужно распарсить
      data = JSON.parse(message);
    } catch (err) {
      this._logError(err);
      this._logError('Error while parsing ws message', message, err);
      this._sentryCapture(err);
      return;
    }

    if ('partial' in data) {
      // Промежуточный результат распознавания, запоминаю и отправляю пользователю
      const { partial: text } = data;
      if (text === this._lastResult) {
        return;
      }
      this._lastResult = text;
      this._socket.emit('result', {
        text,
        final: false,
      });
    } else if ('result' in data) {
      // Финальный результат распознавания, говорю об этом пользователю
      const { text } = data;
      if (!text) {
        this._logError('Result, but no text! Data:', data);
        return;
      }
      this._socket.emit('result', {
        text,
        final: true,
      });
      // this._ws.close();
      this._lastResult = '';
      this._logInfo('Final result, stopped');
    }
  }

  _logInfo(...args) {
    logger.info(this._socket.id, ...args);
  }

  _logError(...args) {
    logger.error(this._socket.id, ...args);
  }

  /**
   * Захват непредвиденных ошибок в Sentry
   */
  _sentryCapture(err) {
    Sentry.configureScope((scope) => {
      scope.setExtra('socket.handshake.query', this._socket.handshake.query);
      scope.setExtra('socket.handshake.headers', this._socket.handshake.headers);
      scope.setExtra('socket.handshake.address', this._socket.handshake.address);
      scope.setExtra('socket.id', this._socket.id);

      Sentry.captureException(err);
    });
  }
};
