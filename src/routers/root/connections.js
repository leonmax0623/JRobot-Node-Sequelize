const { connectionsInfo } = require('../../sockets');

module.exports = [{
  method: 'get',
  path: '/connections',
  // Информация о подключениях через socket.io
  async handler(ctx) {
    ctx.body = connectionsInfo();
  },
}];
