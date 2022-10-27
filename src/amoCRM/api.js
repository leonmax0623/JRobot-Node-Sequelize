/* eslint-disable import/order */
const chalk = require('chalk');
const Sentry = require('@sentry/node');
const configAmo = require('./config');
const config = require('../../config');
const path = require('path');
const fs = require('fs');
const db = require('../../data/models');

const axios = require('axios').create({
  baseURL: config.amo.base_url,
});
const logger = require('intel').getLogger('amo-api');

module.exports = {
  createLead,
  updateLeadStatus,
  updateLeadsCustomFields,
  requestPayment,
  createDemoLead,
  createCompany,
};

/**
 * @param {string} leadName
 * @param {any} payload - name, password, promo, utm_term, email, phone, token, en?
 * @param {integer} amoCompanyId
 */
async function createLead(leadName, payload, amoCompanyId) {
  if (process.env.NODE_ENV !== 'production') {
    logger.info('Creating lead', leadName, payload, amoCompanyId);
    return ~~(Math.random() * 1e9);
  }

  try {
    /* creating lead */
    let leadId;
    {
      const custom_fields = [];

      for (const field of [
        'promo',
        'password',
        'utm_term',
        'utm_campaign',
        'token',
        'utm_source',
        'utm_medium',
        'utm_content',
        'inn',
        'company',
      ]) {
        if (payload[field]) {
          custom_fields.push({
            field_id: configAmo.customFields[field],
            values: [{ value: payload[field] }],
          });
        }
      }
      if (payload.requestPresentation) {
        custom_fields.push({
          field_id: configAmo.customFields.requestPresenation,
          values: [{ enum_id: 'Да' }],
        });
      }

      custom_fields.push({
        field_id: configAmo.cardPipeline,
        values: [{ enum_id: configAmo.cardPipelineStatuses.initial }],
      });

      const resp = await axios.post(
        '/api/v4/leads',
        [{
          name: leadName,
          // created_at: Date.now(),
          status_id: payload.en ? configAmo.statusEn : configAmo.statuses.initial,
          pipeline_id: payload.en ? configAmo.pipelineEn : configAmo.pipeline,
          custom_fields_values: custom_fields,
          _embedded: {
            companies: [
              {
                id: amoCompanyId,
              },
            ],
          },
        }],
        {
          params: { type: 'json' },
          headers: {
            Authorization: `Bearer ${await getToken()}`,
          },
        },
      );

      leadId = resp.data._embedded.leads[0].id;
    }

    /* creating contact */
    const contact = await axios.post(
      '/api/v4/contacts',
      [
        {
          name: ((`${payload.name} ${payload.surname}`) || 'Без имени'),
          first_name: payload.name,
          last_name: payload.surname,
          custom_fields_values: ['email', 'phone', 'position'].map((x) => ({
            field_id: configAmo.customFields[x],
            values: [{
              value: payload[x],
            }],
          })),
        },
      ],
      {
        params: { type: 'json' },
        headers: {
          Authorization: `Bearer ${await getToken()}`,
        },
      },
    );

    await axios.post(
      `/api/v4/leads/${leadId}/link`,
      [
        {
          to_entity_id: contact.data._embedded.contacts[0].id,
          to_entity_type: 'contacts',
          metadata: {
            is_main: true,
          },
        },
      ],
      {
        params: { type: 'json' },
        headers: {
          Authorization: `Bearer ${await getToken()}`,
        },
      },
    );

    return leadId;
  } catch (err) {
    Sentry.captureException(err);
  }
  return null;
}

async function updateLeadStatus(leadId, statusId) {
  const statusName = Object.keys(configAmo.statuses).find(
    (key) => configAmo.statuses[key] === statusId,
  );
  logger.info(chalk`Updating lead {magenta ${leadId}} status {green ${statusId}} ({yellow ${statusName}})`);

  if (process.env.NODE_ENV !== 'production') return;
  const lead = await db.AmoLead.findByPk(leadId);
  const cfv_values = [];
  if (lead.info.passedStatuses) {
    lead.info.passedStatuses.forEach((el) => {
      const baseStatusNam = Object.keys(configAmo.statuses).find(
        (key) => configAmo.statuses[key] === el,
      );
      cfv_values.push({ enum_id: configAmo.cardPipelineStatuses[baseStatusNam] });
    });
  }

  cfv_values.push({ enum_id: configAmo.cardPipelineStatuses[statusName] });

  /* updating lead */
  try {
    await axios.patch(
      '/api/v4/leads',
      [{
        id: leadId,
        updated_at: Date.now(),
        custom_fields_values: [{
          field_id: configAmo.cardPipeline,
          values: cfv_values,
        }],
      }],
      {
        params: { type: 'json' },
        headers: {
          Authorization: `Bearer ${await getToken()}`,
        },
      },
    );
  } catch (err) {
    Sentry.captureException(err);
  }
}

/**
 * @typedef {Map<Number, any>} DataMap id: value
 * @param {Array<{ leadId: Number, dataMap: DataMap }>} data
 */
async function updateLeadsCustomFields(data) {
  if (process.env.NODE_ENV !== 'production') return;
  try {
    await axios.patch(
      '/api/v4/leads',
      data.map(({ leadId, dataMap }) => ({
        id: leadId,
        updated_at: Date.now(),
        custom_fields_values: [...dataMap].map(([id, value]) => ({
          field_id: id,
          values: [{ value }],
        })),
      })),
      {
        params: { type: 'json' },
        headers: {
          Authorization: `Bearer ${await getToken()}`,
        },
      },
    );
  } catch (err) {
    Sentry.captureException(err);
  }
}

async function requestPayment(leadId, { rate, usersCount, period }) {
  if (process.env.NODE_ENV !== 'production') return;
  try {
    const lead = await db.AmoLead.findByPk(leadId);
    const cfv_values = [];
    if (lead.info.passedStatuses) {
      lead.info.passedStatuses.forEach((el) => {
        const baseStatusNam = Object.keys(configAmo.statuses).find(
          (key) => configAmo.statuses[key] === el,
        );
        cfv_values.push({ enum_id: configAmo.cardPipelineStatuses[baseStatusNam] });
      });
    }

    cfv_values.push({ enum_id: configAmo.cardPipelineStatuses.requestedPayment });

    await axios.patch(
      '/api/v4/leads',
      [{
        id: leadId,
        updated_at: Date.now(),
        custom_fields_values: [
          {
            field_id: configAmo.customFields.paymentRate,
            values: [{
              value: translateRate(rate),
            }],
          },
          {
            field_id: configAmo.customFields.paymentUsersCount,
            values: [{
              value: usersCount,
            }],
          },
          {
            field_id: configAmo.customFields.paymentPeriod,
            values: [{
              value: period,
            }],
          },
          {
            field_id: configAmo.cardPipeline,
            values: cfv_values,
          },
        ],
      }],
      {
        params: { type: 'json' },
        headers: {
          Authorization: `Bearer ${await getToken()}`,
        },
      },
    );
  } catch (err) {
    Sentry.captureException(err);
  }
}

async function createDemoLead({
  phone,
  datetime,
  utm_term = null,
}) {
  try {
    const payload = { phone, utm_term };

    /* creating lead */
    const resp = await axios.post(
      '/api/v4/leads',
      [{
        name: `Демо | ${phone}`,
        // created_at: Date.now(),
        status_id: configAmo.demo.status,
        pipeline_id: configAmo.demo.pipeline,
        custom_fields_values: ['promo', 'utm_term'].map((x) => ({
          field_id: configAmo.customFields[x],
          values: [{
            value: payload[x],
          }],
        })),
      }],
      {
        params: { type: 'json' },
        headers: {
          Authorization: `Bearer ${await getToken()}`,
        },
      },
    );
    const leadId = resp.data._embedded.items[0].id;

    /* creating task and contact */
    await Promise.all([
      axios.post(
        '/api/v4/tasks',
        [{
          element_id: leadId,
          element_type: 2, // сделка
          complete_till: String(new Date(datetime).getTime()).substr(0, 10),
          task_type: 2, // встреча
          text: 'Демо',
          responsible_user_id: configAmo.demo.responsible_user_id,
          created_by: configAmo.demo.responsible_user_id,
        }],
        {
          params: { type: 'json' },
          headers: {
            Authorization: `Bearer ${await getToken()}`,
          },
        },
      ),
      axios.post(
        '/api/v4/contacts',
        [{
          name: 'Без имени',
          // created_at: Date.now(),
          leads_id: [leadId],
          custom_fields_values: ['phone'].map((x) => ({
            field_id: configAmo.customFields[x],
            values: [{
              value: payload[x],
              enum: 'WORK',
            }],
          })),
        }],
        {
          params: { type: 'json' },
          headers: {
            Authorization: `Bearer ${await getToken()}`,
          },
        },
      ),
    ]);
  } catch (err) {
    logger.error(err.response.data);
    Sentry.captureException(err);
    throw err;
  }
}

function translateRate(rate) {
  const map = {
    base: 'Базовый',
    extended: 'Расширенный',
    enterprise: 'Корпоративный',
    professional: 'Профессиональный',
  };
  if (rate in map) {
    return map[rate];
  }
  return rate;
}

/**
 * @param {string} companyName
 * @param {any} payload - inn, email, phone, name, companyName
 */
async function createCompany(companyName, payload) {
  if (process.env.NODE_ENV !== 'production') {
    logger.info('Creating company', companyName, payload);
    return ~~(Math.random() * 1e9);
  }

  try {
    /* creating company */
    let companyId;
    {
      const custom_fields_values = [];

      for (const field of [
        'inn',
        'email',
        'phone',
        'name',
        'companyName',
      ]) {
        if (payload[field]) {
          custom_fields_values.push({
            field_id: configAmo.customCompanyFields[field],
            values: [{ value: payload[field] }],
          });
        }
      }

      const resp = await axios.post(
        '/api/v4/companies',
        [
          {
            name: companyName,
            custom_fields_values,
          },
        ],
        {
          params: { type: 'json' },
          headers: {
            Authorization: `Bearer ${await getToken()}`,
          },
        },
      );
      companyId = resp.data._embedded.companies[0].id;
    }

    return companyId;
  } catch (err) {
    Sentry.captureException(err);
  }
  return null;
}

/**
 * Return AMO access token
 * @returns {Promise<string|null>}
 */
async function getToken() {
  const basename = process.cwd();
  const amoFile = path.join(basename, '.amo');
  if (fs.existsSync(amoFile)) {
    const amoTokenJson = fs.readFileSync(amoFile);
    const amoToken = JSON.parse(amoTokenJson);
    return amoToken.access_token;
  }
  return null;
}
