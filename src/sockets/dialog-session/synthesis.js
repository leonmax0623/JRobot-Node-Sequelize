const axios = require('axios').default;
const base64 = require('base-64');
const utf8 = require('utf8');
const logger = require('intel').getLogger('tts');
const googleTextToSpeech = require('@google-cloud/text-to-speech');
const config = require('../../../config');
const knocker = require('../../tools/knocker');
const audioApi = require('../../tools/audio-api');
const fs = require('fs');
const path = require('path');

const { getToken: getYandexIamToken } = require('./yandex-iam-token');

const basename = process.cwd();

// eslint-disable-next-line
String.prototype.hashCode = function () {
  let hash = 0; let i; let
    chr;
  if (this.length === 0) return hash;
  // eslint-disable-next-line
  for (i = 0; i < this.length; i++) {
    chr = this.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
};

const USE_GOOGLE = process.env.TTS === 'google';
logger.info(`Using google: ${USE_GOOGLE ? 'Yes' : 'Not'}`);

const googleClient = USE_GOOGLE
  ? new googleTextToSpeech.TextToSpeechClient({
    keyFilename: './config/google-auth.json',
  })
  : null;

/**
 * Класс, занимающийся синтезом и кэшированием результатов
 */
class SynthesStore {
  constructor() {
    /**
     * Сохранённые данные
     * @type {Map<string, { opus?: ArrayBuffer, mp3?: ArrayBuffer }>}
     */
    this.stored = new Map();

    /**
     * Приоритет тех или иных синтезов
     * @type {string[]}
     */
    this.bumpQueue = [];

    // Статистика
    this.stats = {
      synthesized: 0,
      convertedNew: 0,
      used: 0,
      convertedUsed: 0,
    };
  }

  /**
   * Если по запрашиваемым параметрам есть данные, то они возвращаются,
   * а эти данные поднимаются в начало очереди как актуальные. Алгоритм
   * как на имилжбордах, когда треды поднимаются в топ, бампаются.
   *
   * @typedef {{
   * text: string,
   * emotion: string,
   * voice: string,
   * speed: number,
   * format: string }} SynthesOptions
   * @typedef {{
   * speech: ArrayBuffer,
   * original: ArrayBuffer }} SynthesResult `original` - речь в формате `audio/ogg`
   * @param {SynthesOptions} opts
   * @returns {Promise<SynthesResult>}
   */
  async get({
    text,
    emotion = config.yandexCloudAPI.tts.defaultEmotion,
    voice = config.yandexCloudAPI.tts.defaultVoice,
    speed = config.yandexCloudAPI.tts.defaultSpeed,
    format = 'opus',
  }) {
    const opts = {
      text, emotion, voice, speed, format,
    };
    const key = USE_GOOGLE
      ? generateKey({
        text,
        voice: 'google',
        emotion: null,
        speed: 1,
      })
      : generateKey(opts);
    this._bump(key);

    if (this.stored.has(key)) {
      // синтез есть
      const storedData = this.stored.get(key);
      if (format in storedData) {
        // Есть даже в нужном формате
        this.stats.used += 1;
        return {
          speech: storedData[format],
          original: storedData.opus,
        };
      }

      // В нужном формате нет, конвертируем и сохраняем
      const { opus: opusRecord } = storedData;
      const converted = await audioApi.convert({
        data: opusRecord,
        from: 'opus',
        to: format,
      });

      this.stats.convertedUsed += 1;
      storedData[format] = converted;
      return {
        speech: converted,
        original: storedData.opus,
      };
    }

    // Синтеза нет, делаю
    try {
      // const record = await synthesize(opts);
      let recordData;

      if (USE_GOOGLE) {
        recordData = await googleSynthesize({ text });
      } else {
        const hString = [opts.text, opts.emotion, opts.voice, opts.speed.toFixed(1)].join('_');
        const hash = hString.hashCode();
        const chunkedHash = hash.toString().match(/.{3}/g);
        const voiceFilePath = path.join(basename, `/${['voices', chunkedHash[0], chunkedHash[1]].join('/')}`);

        try {
          if (!fs.existsSync(voiceFilePath)) {
            fs.mkdirSync(voiceFilePath, { recursive: true });
            logger.info(`Creating folder: ${voiceFilePath}`);
          }

          if (fs.existsSync(`${voiceFilePath}/${hash}`)) {
            logger.info(`Found saved voice: ${voiceFilePath}/${hash}`);

            recordData = fs.readFileSync(`${voiceFilePath}/${hash}`);
          } else {
            opts.emotion = getEmotionByVoice(opts);

            const response = await synthesize(opts);

            recordData = response.data;
            // eslint-disable-next-line
            fs.open(`${voiceFilePath}/${hash}`, 'w', (err, fd) => {
              if (err) {
                // eslint-disable-next-line
                throw `could not open file: ${err}`;
              }
              // eslint-disable-next-line
              fs.write(fd, recordData, 0, recordData.length, null, (err) => {
                // eslint-disable-next-line
                if (err) throw `error writing file: ${err}`;
                fs.close(fd, () => {
                  logger.info('rote the file successfully');
                });
              });
            });

            logger.info(`Saving new voice: ${voiceFilePath}/${hash}`);
          }
        } catch (err) {
          logger.error(err);
          // TODO: если сдох аим токен, то здесь будет ошибка.
        }
      }

      this.stored.set(key, { opus: recordData });
      this.stats.synthesized += 1;

      if (opts.format && opts.format !== 'opus') {
        const converted = await audioApi.convert({
          data: recordData,
          from: 'opus',
          to: opts.format,
        });
        this.stored.get(key)[opts.format] = converted;
        this.stats.convertedNew += 1;
        return {
          speech: converted,
          original: recordData,
        };
      }

      return {
        original: recordData,
        speech: recordData,
      };
    } catch (err) {
      if (err.response) {
        const { status, statusText, data } = err.response;
        logger.error(status, statusText, data);
        if (status !== 400) {
          knocker.knock(`[TTS]: Ошибка с ответом от сервера: ${status} ${statusText}`);
        }
      } else {
        logger.error(err);
        knocker.knock('[TTS]: Ошибка, и дело не в Яндексе, похоже');
      }
      throw err;
    }
  }

  _bump(key) {
    const index = this.bumpQueue.indexOf(key);
    if (index >= 0) {
      this.bumpQueue.splice(index, 1);
      this.bumpQueue.push(key);
    } else {
      this.bumpQueue.push(key);

      // Чистка лишних, самых старых записей
      const excessCount = this.bumpQueue.length - config.ttsCaching.itemsLimit;
      if (excessCount > 0) {
        const keys = this.bumpQueue.splice(0, excessCount);
        keys.forEach((x) => this.stored.delete(x));
      }
    }
  }

  getStats() {
    // Подсчёт данных в байтах
    const storedByteLength = [...this.stored.values()].reduce((total, val) => {
      const bytes = Object.values(val).reduce((prev, arr) => prev + arr.byteLength, 0);
      return total + bytes;
    }, 0);

    return {
      ...this.stats,
      storedCount: this.stored.size,
      storedByteLength,
    };
  }

  clearData() {
    this.stored = new Map();
    this.bumpQueue = [];
  }
}

// Экспорт синглтона
module.exports = new SynthesStore();

/* internal tools */

/**
 * Собственно обращение к яндексу.
 */
async function synthesize({
  text, emotion, voice, speed,
}) {
  const {
    folderId,
    tts: {
      url,
      lang,
    },
  } = config.yandexCloudAPI;
  
  const aimToken = await getYandexIamToken();

  return axios.post(
    url,
    null,
    {
      headers: {
        Authorization: `Bearer ${aimToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-client-request-id': new Date().getMilliseconds(),
      },
      params: {
        lang,
        folderId,
        emotion,
        voice,
        speed,
        text,
      },
      responseType: 'arraybuffer',
    },
  );
}

/**
 * Синтез через Google
 */
async function googleSynthesize({ text }) {
  const request = {
    input: { text },
    voice: {
      languageCode: 'en-US',
      ssmlGender: 'MALE',
      name: 'en-US-Wavenet-A',
    },
    audioConfig: {
      audioEncoding: 'OGG_OPUS',
    },
  };

  const [response] = await googleClient.synthesizeSpeech(request);

  return response.audioContent;
}

/**
 * Генерация уникального ключа для определённых параметров
 *
 * @param {SynthesOptions} opts
 * @returns {string}
 */
function generateKey(opts) {
  const {
    text, emotion, speed, voice,
  } = opts;
  const encodedText = base64.encode(utf8.encode(text));
  const roundedSpeed = String(~~(speed * 10) / 10); // 1.41251253251 -> '1.4'
  return `${encodedText}-${emotion}-${voice}-${roundedSpeed}`;
}

/**
 *
 * @param opts
 * @returns {string}
 */
function getEmotionByVoice(opts) {
  let emotion = '';
  // eslint-disable-next-line
  switch (opts.voice) {
    case 'alena':
      emotion = ['neutral', 'good'][Math.floor(Math.random() * 1)];
      // eslint-disable-next-line
      break;
    case 'oksana':
      emotion = 'good';
      // eslint-disable-next-line
      break;
    case 'filipp':
      emotion = '';
      // eslint-disable-next-line
      break;
    case 'jane':
      emotion = ['neutral', 'good', 'evil'][Math.floor(Math.random() * 2)];
      // eslint-disable-next-line
      break;
    case 'omazh':
      emotion = ['neutral', 'evil'][Math.floor(Math.random() * 1)];
      // eslint-disable-next-line
      break;
    case 'zahar':
      emotion = ['neutral', 'good'][Math.floor(Math.random() * 1)];
      // eslint-disable-next-line
      break;
    case 'ermil':
      emotion = ['neutral', 'good'][Math.floor(Math.random() * 1)];
      // eslint-disable-next-line
      break;
  }

  return emotion;
}
