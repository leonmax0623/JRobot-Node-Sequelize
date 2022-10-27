const IO = require('socket.io');
const Sentry = require('@sentry/node');
const DialogSession = require('./DialogSession');
const STTSession = require('./STTSession');

const logger = require('intel').getLogger('io');

const io = IO();

const dialogNamespace = io.of('/dialog');
const sttNamespace = io.of('/stt');

dialogNamespace.on('connect', createSetup(DialogSession));
sttNamespace.on('connect', createSetup(STTSession));

/**
 * Создаёт универсальную функцию-обработчик подключения
 * @param {DialogSession|STTSession} SessionConstructor
 */
function createSetup(SessionConstructor) {
  /**
   * @param {SocketIO.Socket} socket
   */
  const func = async (socket) => {
    // console.log(new Date(socket.handshake.time));
    logger.info(`CONNECTION ${socket.id} ${extractAddress(socket)}`);
    // socket.ip = extractAddress(socket);
    try {
      const session = new SessionConstructor(socket);
      await session.setup();
      socket.emit('session-setted-up');
    } catch (err) {
      logger.info('SETUP FAILED.', socket.id, err);
      if (!err.expose) {
        Sentry.configureScope((scope) => {
          scope.setLevel(Sentry.Severity.Fatal);
          scope.setExtra('handshake', socket.handshake);
          Sentry.captureException(err);
        });
      }
      socket.emit('session-setup-failed', err.message);
      // socket.disconnect();
    }
  };

  return func;
}

/**
 * Извлекает ip из сокета
 * @param {SocketIO.Socket} socket
 * @returns {string}
 */
function extractAddress(socket) {
  try {
    return socket.handshake.headers['x-real-ip'].split(', ')[0];
  } catch (e) {
    try {
      return socket.handshake.address;
    } catch (e2) {
      return '?????';
    }
  }
}

module.exports.connectionsInfo = () => {
  /** @type {SocketIO.Socket[]} */
  const sockets = [
    ...Object.values(dialogNamespace.sockets),
    ...Object.values(sttNamespace.sockets),
  ];
  return sockets.map((socket) => {
    const ip = extractAddress(socket);
    const { id } = socket;
    const time = new Date(socket.handshake.time).toISOString();
    return { ip, id, time };
  });
};

module.exports.attachToServer = function (server) {
  io.attach(server, {
    pingInterval: 5000,
  });
};
