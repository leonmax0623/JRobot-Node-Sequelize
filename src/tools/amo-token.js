/*
  Модуль занимается обновлением токена
*/

const cron = require('./cron');
const config = require('../../config');
const logger = require('intel').getLogger('amo-token');
const Sentry = require('@sentry/node');
const fs = require('fs');
const path = require('path');
const axios = require('axios').create({
  baseURL: config.amo.base_url,
});

const basename = process.cwd();

/**
 * Настройка задачи по обновления токена
 */
function setup() {
  cron.schedule(config.crons.amoAccessTokenCron, refreshAccessToken);
  logger.info('Refresh amo scheduled');
  refreshAccessToken();
}

/**
 * Проверяет активность токена и если что обновляет его
 */
async function refreshAccessToken() {
  if (process.env.NODE_ENV !== 'production') {
    logger.info('Refresh amo access token blocked for non-production!');
    return;
  }

  try {
    const amoFile = path.join(basename, '.amo');
    if (fs.existsSync(amoFile)) {
      const amoTokenJson = fs.readFileSync(amoFile);
      const amoToken = JSON.parse(amoTokenJson);

      const resp = await axios.post(
        '/oauth2/access_token',
        {
          client_id: config.amo.client_id,
          client_secret: config.amo.client_secret,
          grant_type: 'refresh_token',
          refresh_token: amoToken.refresh_token,
          redirect_uri: config.amo.redirect_uri,
        },
        {
          params: { type: 'json' },
        },
      );
      //
      // const r = await axios.post(
      //     '/api/v4/companies',
      //     [
      //         {
      //             name: 'trulala_2',
      //             custom_fields_values: [
      //                 {
      //                     field_id: 667971,
      //                     values: [
      //                         {value: 'trulala_2'},
      //                     ],
      //                 }
      //             ],
      //         }
      //     ],
      //     {
      //         params: { type: 'json' },
      //         headers: {
      //             'Authorization': 'Bearer ' + resp.data.access_token
      //         },
      //     },
      // );
      // console.log('-----------------------------------');
      // console.log(r.data._embedded);
      // console.log('-----------------------------------');

      fs.writeFile(amoFile, JSON.stringify(resp.data), (err) => {
        if (err) throw err;
        logger.info('Refresh amo access token done');
      });
    }
  } catch (err) {
    Sentry.captureException(err);
    logger.error('Refresh amo access token error |', err);
    // todo оповещать о проблеме
  }
}

module.exports = { setup };
