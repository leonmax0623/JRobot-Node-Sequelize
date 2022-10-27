const synthesis = require('../../sockets/dialog-session/synthesis');
const config = require('../../../config');

module.exports = [{
  method: 'get',
  path: '/tts-stats',
  // Статистика синтеза речи (tts -> text-to-speech)
  async handler(ctx) {
    ctx.body = {
      ...synthesis.getStats(),
      cacheLimit: config.ttsCaching.itemsLimit,
    };
  },
}];
