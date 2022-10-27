const config = require('./config');
const amoAPI = require('./api');
const db = require('../../data/models');

module.exports = {
  accountCreated,
  scriptEdited,
  scriptStarted,
  userCreated,
  paymentRequested,
};

const IGNORE = !!process.env.IGNORE_AMO_HOOKS;

/**
 * @param {any} info promo, phone, password, email, utm_term, requestPresentation, utm_campaign
 */
async function accountCreated(account, user, info, amoCompanyId) {
  // Создаю сделку в amoCRM
  const leadId = await amoAPI.createLead(account.name, info, amoCompanyId);

  await Promise.all([
    // Создаю сделку в базе, чтобы отслеживать пройденные статусы
    db.AmoLead.create({
      id: leadId,
      info: {
        creatorId: user.id,
        passedStatuses: [],
      },
    }),
    // Привязываю к аккаунту id сделки
    account.update({ leadId }),
  ]);
}

async function scriptEdited(actor) {
  if (IGNORE) return;
  const account = await db.Account.findByPk(actor.accountId);
  if (account.status !== 'test') {
    return;
  }
  const lead = await db.AmoLead.findByPk(account.leadId);
  const statusId = config.statuses.editedOrCreatedScript;
  if (
    lead
    && !lead.info.passedStatuses.includes(statusId)
  ) {
    await commitStatus(lead, statusId);
  }
}

async function userCreated(actor) {
  if (IGNORE) return;
  const account = await db.Account.findByPk(actor.accountId);
  if (account.status !== 'test') {
    return;
  }
  const lead = await db.AmoLead.findByPk(account.leadId);
  const statusId = config.statuses.firstUserCreated;
  if (
    lead
    && !lead.info.passedStatuses.includes(statusId)
    // && lead.info.creatorId === actor.id
  ) {
    await commitStatus(lead, statusId);
  }
}

async function scriptStarted(actor) {
  if (IGNORE) return;
  const account = await db.Account.findByPk(actor.accountId);
  if (account.status !== 'test') {
    return;
  }
  const lead = await db.AmoLead.findByPk(account.leadId);
  const { startedScript, anotherUserStartedScript } = config.statuses;
  if (lead) {
    if (
      lead.info.creatorId === actor.id
      && !lead.info.passedStatuses.includes(startedScript)
    ) {
      await commitStatus(lead, startedScript);
    }
    if (
      lead.info.creatorId !== actor.id
      && !lead.info.passedStatuses.includes(anotherUserStartedScript)
    ) {
      await commitStatus(lead, anotherUserStartedScript);
    }
  }
}

async function paymentRequested(account, payload) {
  if (IGNORE) return;
  const { leadId } = account;
  if (!leadId) {
    throw new Error('Account without lead id requested payment');
  }

  await amoAPI.requestPayment(leadId, payload);
}

// * internal module utils *

/**
 * Обновляет статус сделки и фиксирует это в локальной базе данных
 */
async function commitStatus(lead, statusId) {
  await amoAPI.updateLeadStatus(
    lead.id,
    statusId,
  );
  const info = { ...lead.info };
  info.passedStatuses.push(statusId);
  await lead.update({ info });
  // await lead.update({
  //   info: {
  //     ...lead.info,
  //     passedStatuses: [
  //       ...lead.info.passedStatuses,
  //       statusId,
  //     ],
  //   },
  // });
  // lead.info.passedStatuses.push(statusId);
  // await lead.save();
}
