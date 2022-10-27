const chalk = require('chalk');
const logger = require('intel').getLogger('i18n');
// eslint-disable-next-line
const ru = require('../locales/ru');
// eslint-disable-next-line
const en = require('../locales/en');

const LOCALE = process.env.LOCALE || 'ru';
logger.info(chalk`Using locale: {cyan.bold ${LOCALE}}`);

const locales = { ru, en };

/**
 * Выдаёт данные из папки locales в зависимости от переменной окружения LOCALE
 */
module.exports = {
  get() { return locales[LOCALE]; },
};
