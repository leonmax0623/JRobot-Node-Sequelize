/*
  Модуль занимается очисткой старых реплик и фидбеков
*/

const cron = require('./cron');
const config = require('../../config');
const db = require('../../data/models');
const logger = require('intel').getLogger('cleaning');
const Sentry = require('@sentry/node');

/**
 * Настройка задачи по очистке
 */
function setup() {
  cron.schedule(config.crons.cleaningCron, clean);
  logger.info('Cleaning scheduled');
  clean();
}

/**
 * Очистка старых реплик (старше 60 дней)
 * и последующий вакуум базы, посколько реплики - это самые объёмные данные в базе вообще.
 */
async function clean() {
  if (process.env.NODE_ENV !== 'production') {
    logger.info('No production, so no cleaning');
  }
  try {
    await Promise.all([
      db.sequelize.query(
        'delete from "Replicas" where now() - "speakedAt" > interval \'60 days\'',
        { type: db.Sequelize.QueryTypes.DELETE },
      ),
      db.sequelize.query(
        'delete from "Feedbacks" where now() - "createdAt" > interval \'20 days\'',
        { type: db.Sequelize.QueryTypes.DELETE },
      ),
    ]);
    await db.sequelize.query('VACUUM');
    logger.info('Cleaning done');
  } catch (err) {
    Sentry.captureException(err);
    logger.error('Cleaning error |', err);
  }
}

module.exports = { setup };
