const PORT = process.env.AUDIO_WORKER_PORT || 10210;
const axios = require('axios').default.create({
  baseURL: `http://localhost:${PORT}`,
});
const logger = require('intel').getLogger('audio-api');
const chalk = require('chalk');
const FormData = require('form-data');
const { knock } = require('./knocker');

logger.info(`Using port ${chalk.blue.bold(PORT)}`);

/**
 * Модуль предоставляет удобное АПИ взаимодействия с сервисом аудио-обработки
 */
module.exports = {
  /**
   * Конвертация в ogg-vorbis
   *
   * @param {Buffer} data
   * @param {string} mimeType
   * @returns {Promise<Buffer>}
   */
  async convertToOggVorbis(data, mimeType) {
    try {
      const form = new FormData();
      form.append('audio', data, {
        filename: `file.${mimeType.match(/^audio\/(\w+)/)[1]}`,
        contentType: mimeType,
      });
      const { data: converted } = await axios.post(
        '/convert-to-ogg-vorbis',
        form.getBuffer(),
        {
          headers: form.getHeaders(),
          responseType: 'arraybuffer',
        },
      );
      return converted;
    } catch (e) {
      logger.error('Error in convert-to-ogg-vorbis:', e);
      knock('Convert-to-ogg-vorbis problem!');
    }
    return null;
  },
  /**
   * Соединяет кусочки аудио в единую последовательность
   *
   * @param {{ data: Buffer, mimeType: string }[]} sequence
   * @returns {Promise<Buffer>}
   */
  async combineSequence(sequence) {
    try {
      const form = new FormData();
      await sequence.map(({ data, mimeType }, i) => {
        form.append(String(i), data, {
          filename: `file.${mimeType.match(/^audio\/(\w+)/)[1]}`,
          contentType: mimeType,
        });
      });
      const { data: combined } = await axios.post(
        '/combine',
        form.getBuffer(),
        {
          headers: form.getHeaders(),
          responseType: 'arraybuffer',
        },
      );
      return combined;
    } catch (e) {
      logger.error('Error in combine:', e);
      knock('Combine audio problem!');
    }
    return null;
  },
  /**
   * Конвертирует во что угодно
   * @returns {Promise<ArrayBuffer>}
   */
  async convert({ data, from, to }) {
    try {
      const form = new FormData();
      form.append('source', data, {
        filename: `source.${from}`,
      });
      const { data: converted } = await axios.post(
        '/convert',
        form.getBuffer(),
        {
          params: { to },
          headers: form.getHeaders(),
          responseType: 'arraybuffer',
        },
      );
      return converted;
    } catch (e) {
      logger.error('Error in convert:', e);
      knock('Convert audio to custom type error');
    }
    return null;
  },
};
