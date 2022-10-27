const mailer = require('nodemailer');
const logger = require('intel').getLogger('mailer');
const fs = require('fs');
const chalk = require('chalk');
const config = require('../../config').mailer;
const entryLink = require('./entry-link');

/**
 * Шаблоны писем из папки static
 * @type {Map<string, string>}
 */
const templates = new Map();

if (process.env.NODE_ENV !== 'test') {
  for (const name of Object.keys(config.mailPathes)) {
    fs.readFile(config.mailPathes[name], { encoding: 'utf8' }, (err, data) => {
      if (err) {
        logger.error(`Error while reading ${name} HTML:`, err);
        return;
      }
      templates.set(name, data);
      // logger.info(`'${name}' HTML loaded, size:`, data.length)
    });
  }
}

const transporter = process.env.NODE_ENV === 'production'
  ? mailer.createTransport({
    host: config.host,
    port: 465,
    secure: true,
    auth: {
      user: config.username,
      pass: config.password,
    },
  })
  : null;

/**
 * Подменяет в строке переменные, экранированные в стиле "mustache" (пример: "{{ entry_link }}")
 *
 * @param {string} source - исходная строка
 * @param {Map<string, any>} map - карта переменных
 * @returns {string} результат
 */
function replaceMustache(source, map) {
  return source.replace(/\{\{ *(\w+) *\}\}/g, (sub, key) => {
    if (map.has(key)) {
      return map.get(key);
    }
    return sub;
  });
}

/**
 * Отправляет электронное письмо. Можно amp, а можно html, а можно просто текст.
 */
async function sendMail({
  to, subject, text, html, amp, attachments,
}) {
  if (!to) {
    throw new Error('No receiver');
  }
  try {
    const from = config.sender;
    const message = {
      from, to, subject, text, html, amp, attachments,
    };
    const { NODE_ENV, NO_MAILS } = process.env;
    if (NODE_ENV !== 'testing') {
      logger.info('Sending mail to', chalk.yellow(to), 'with subject:', subject);
    }
    if (NODE_ENV === 'production' && !NO_MAILS) {
      await transporter.sendMail(message);
    } else {
      logger.info(chalk.underline.red('NO PRODUCTION or NO MAILS so NO MAILS!'));
    }
  } catch (e) {
    logger.debug('Send message error:', e.message);
    throw e;
  }
}

/**
 * Отправка пригласительного письма пользователю с подстановкой в письмо всяких данных
 * @param {*} user - пользователь
 * @param {*} account - его аккаунт
 * @param {*} password - его пароль
 */
async function inviteUser(user, account, password) {
  const { name, username } = user;
  const accountName = account.name;

  // Карта переменных, которые подставятся в шаблон
  const map = new Map([
    ['username', username],
    ['name', name],
    ['password', password],
    ['entry_link', await entryLink.makeEntryLink({
      userId: user.id,
      next: 'trainer',
    })],
    ['account_name', accountName],
  ]);
  if (user.params && user.params.token) {
    map.set('token', user.params.token);
  }
  // Подставляю в шаблон
  const amp = replaceMustache(templates.get('invite') || '', map);
  // Отправляю
  await sendMail({
    to: username,
    subject: `Подключение к аккаунту ${accountName} в JRobot`,
    amp,
    html: amp,
  });
}

/**
 * Отправка письма на восстановление доступа пользователю
 * @param {*} user - Пользователь
 */
async function resetUser(user) {
  const { name, username } = user;
  const map = new Map([
    ['username', username],
    ['name', name],
    ['entry_link', await entryLink.makeEntryLink({ userId: user.id })],
  ]);
  const amp = replaceMustache(templates.get('reset') || '', map);
  await sendMail({
    to: username,
    subject: 'Восстановление пароля в JRobot',
    amp,
    html: amp,
  });
}

module.exports = {
  sendMail,
  templates,
  replaceMustache,
  inviteUser,
  resetUser,
};
