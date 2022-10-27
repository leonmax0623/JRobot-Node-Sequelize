const logger = require('intel').getLogger('account-deadlines');
const Sentry = require('@sentry/node');
const memory = require('./memory');
const cron = require('./cron');
const config = require('../../config');

const { db } = memory;

module.exports = { setup, updateDeadlines };

/**
 * Устанавливает периодический таск на перенос дедлайнов у аккаунтов
 */
function setup() {
  cron.schedule(config.crons.deadlinesUpdateCron, task);
  task();

  async function task() {
    try {
      logger.info('Account-deadlines task activated');
      await updateDeadlines();
      logger.info('Account-deadlines task done');
    } catch (err) {
      logger.debug(err);
      Sentry.captureException(err);
    }
  }
}

/**
 * Ищет аккаунты в базе, у которых дедлайн истекает
 * в ближайшие сутки, и, если у них есть доступные месяцы,
 * списывает один, переносит дедлайн и устанавливает timeLeft
 * в timePerMonth
 *
 * @returns {Promise<any>}
 */
async function updateDeadlines() {
  // Сбор подходящих аккаунтов
  const accounts = await db.sequelize.query(`
    select id, deadline
    from "Accounts"
    where
      extract('epoch' from deadline - now()) < 0
      and "remainingMonths" > 0
  `, {
    type: db.Sequelize.QueryTypes.SELECT,
  });

  if (!accounts.length) return;

  /** @type {{ id: number, deadline: string, nextDeadline: string }[]} */
  const deadlinesInfo = accounts.map(({ id, deadline }) => {
    const nextDeadline = new Date(deadline);
    nextDeadline.setMonth(nextDeadline.getMonth() + 1);
    return {
      id,
      deadline: deadline.toISOString(),
      nextDeadline: nextDeadline.toISOString(),
    };
  });

  // Вывод информации о переносе и новых дедлайнах
  {
    const info = deadlinesInfo.map(
      ({ id, deadline, nextDeadline }) => `${id}: ${deadline} -> ${nextDeadline}`,
    );
    logger.info(`Updating account deadlines:\n   ${info.join('\n   ')}`);
  }

  // Примение переноса на один месяц
  // TODO: сделать перенос зависимым от текущей даты (то есть переносить на несколько месяцев сразу
  // при необходимости)
  await Promise.all(deadlinesInfo.map((acc) => db.sequelize.query(`
    update "Accounts"
    set
      "remainingMonths" = "remainingMonths" - 1,
      "timeLeft" = "timePerMonth",
      deadline = '${acc.nextDeadline}'
    where id = ${acc.id}
  `)));
}
