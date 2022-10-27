process.env.NODE_ENV = 'production';

const db = require('../../data/models');
const amoApi = require('../amoCRM/api');
const amoHooks = require('../amoCRM/hooks');
const logger = require('intel').getLogger('update-leads');

(async () => {
  const accounts = await db.Account.findAll({
    where: {
      leadId: null,
    },
  });
  for (const account of accounts) {
    // eslint-disable-next-line
    const user = await db.User.findOne({
      where: {
        accountId: account.id,
        role: 'admin',
      },
      order: [['id', 'ASC']],
    });

    if (user == null) {
      // eslint-disable-next-line
      continue;
    }

    const company = (account.params != null && typeof (account.params.company) !== 'undefined' ? account.params.company : '');
    const name = (`${user.params != null && typeof (user.params.surname) !== 'undefined' ? user.params.surname : ''} ` || `${user.params != null && typeof (user.params.position) !== 'undefined' ? user.params.position : ''}` || '');
    const phone = (user.params != null && typeof (user.params.phone) !== 'undefined' ? user.params.phone : '');
    const surname = (user.params != null && typeof (user.params.surname) !== 'undefined' ? user.params.surname : '');
    // eslint-disable-next-line
    const amoCompanyId = await amoApi.createCompany(
      company,
      {
        inn: account.inn,
        email: user.username,
        phone,
        name,
        companyName: company,
      },
    );

    const amoPayload = {
      password: 'N/A',
      utm_term: 'N/A',
      utm_campaign: 'N/A',
      utm_source: 'N/A',
      utm_medium: 'N/A',
      utm_content: 'N/A',
      email: user.username,
      phone,
      promo: 'N/A',
      requestPresentation: 'N/A',
      company,
      inn: account.inn,
      name: account.name,
      surname,
    };

    // eslint-disable-next-line
    await Promise.all([
      amoHooks.accountCreated(account, user, amoPayload, amoCompanyId),
    ]);

    logger.info(`Created new lead in AMO for ${account.name}`);
  }
})();
