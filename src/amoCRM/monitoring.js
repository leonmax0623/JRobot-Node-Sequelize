const Sentry = require('@sentry/node');
const logger = require('intel').getLogger('amo-monitor');
const memory = require('../tools/memory');
const config = require('./config');
const api = require('./api');
const cron = require('../tools/cron');
const { crons: { amoMetricsCron } } = require('../../config');

module.exports.setup = function () {
  if (process.env.NODE_ENV !== 'production' || !process.env.SETUP_METRICS) {
    return;
  }
  task();
  cron.schedule(amoMetricsCron, task);

  async function task() {
    logger.info('Updating accounts metrics...');
    try {
      await updateTestAccountsMetrics();
    } catch (err) {
      Sentry.captureException(err);
    }
    logger.info('Metrics updated');
  }
};

async function updateTestAccountsMetrics() {
  if (process.env.NODE_ENV !== 'production') return;
  // Сначала сбор тех аккаунтов, для которых будут собираться данные
  /** @type {Array<{ id: number, leadId: number }>} */
  const accountLead = await memory.select(`
    select id, "leadId"
    from "Accounts"
    where
      status = 'test'
      and "leadId" in (
        select id from "AmoLeads"
      )
  `);

  // Сбор данных
  const data = await Promise.all(accountLead.map(
    async ({ id: accountId, leadId }) => {
      const [
        usersCount,
        scriptsCount,
        timeCount,
      ] = await Promise.all([
        memory.db.User.count({ where: { accountId } }),
        memory.db.Script.count({ where: { accountId } }),
        memory.db.Session.sum('duration', { where: { accountId } }),
      ]);

      return {
        leadId,
        dataMap: new Map([
          [config.customFields.usersCount, usersCount],
          [config.customFields.scriptsCount, scriptsCount],
          [config.customFields.timeCount, ~~(timeCount / 1e3 / 60)], // Время в минутах
        ]),
      };
    },
  ));

  // Отправка данных в amoCRM
  await api.updateLeadsCustomFields(data);
}
