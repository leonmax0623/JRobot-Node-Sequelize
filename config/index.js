const path = require('path');

const cwd = process.cwd();

function resolve(p) {
  return path.join(cwd, p);
}

module.exports = {
  sentryDSN: 'https://fdc9f2fddf7f47428402264e673573f6@sentry.io/1838895',
  yandexCloudAPI: {
    folderId: 'b1glcouq6mq7cefnr1fn',
    tts: {
      url: 'https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize',
      lang: 'ru-RU',
      defaultEmotion: 'good',
      defaultVoice: 'ermil',
      defaultSpeed: 1,
    },
  },
  ttsCaching: {
    // Максимальное количество кешируемых запросов
    itemsLimit: 15000,
  },
  // Кроны для различных задач
  crons: {
    amoMetricsCron: '34 0,8-20 * * *',
    // Каждый час в 55 минут
    deadlinesUpdateCron: '55 * * * *',
    entriesClearingCron: '0 0 * * *',
    reportsResettingCron: '0 0 * * *',
    cleaningCron: '0 4 1,11,21 * *',
    savedRecordsCron: '0 * * * *',
    amoAccessTokenCron: '0 * * * *',
  },
  app: {
    // Секрет для подписи JWT
    secret: 'veryverySecret&StrongKeY',
    // Форматирование intel
    formatterOptions: {
      format: '[%(date)s] %(levelname)s %(name)s: %(message)s',
      datefmt: '%Y-%m-%d %H:%M:%S.%L',
      colorize: true,
    },
    /** Время, за которое сгорают ссылки для входа */
    entryExpiresIn: '2M',
  },
  dialog: {
    // Таймаут обращения к семантическому анализатору
    compareTimeout: 1000 * 5,
    /** Время, через которое ставится автопауза при молчании */
    autopauseDelay: 200e3,
    // Значение скрытия слов, начиная с которого сохраняются записи сессий
    recordsSavingHideValue: 0.7,
  },
  // Параметры отправки почты
  mailer: {
    host: 'smtp.yandex.ru',
    sender: 'care@jrobot.pro',
    username: 'care@jrobot.pro',
    password: ']Xs;3fjRVQ2I',
    mailPathes: {
      invite: resolve('static/invite.min.html'),
      reset: resolve('static/reset.min.html'),
      // todo - minify
      feedback: resolve('static/feedback.html'),
      // report: resolve('static/report.min.html'),
    },
  },
  root: {
    // Секрет для подписи токенов для рутов
    jwtSecret: 'alskdjfalk;j;oerdffvm 24123513  345wdf jdsflkj asddlkf 23l4 wef',
  },
  dadata: {
    token: 'c7605f1c87506ee32ae4e9135628cc1c55881158',
    secret: '9a370086e3e1541aa2e04a3a7c920660295b7aa9',
  },
  sms: {
    user: '79092825668',
    password: '4Yp9tRzfwY',
  },
  amo: {
    base_url: 'https://jrobot.amocrm.ru',
    client_id: '536ad5d5-5059-475a-a983-bff3bbe541fe',
    client_secret: 'zgMuOeYqsElwbwgZuwFkqZGDhKYbXGTTKHTCxo1kC6NvBVuBgtKuEwwXcf0CKEXh',
    redirect_uri: 'https://jrobot.amocrm.ru/',
  }
};
