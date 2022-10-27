const axios = require('axios').default;
const { sms } = require('../../config');
const logger = require('intel').getLogger('sms-api');

function sendSMSWithCode(phone, code) {
  logger.info(`New sms for ${phone}. Code is ${code}`);
  // eslint-disable-next-line
  phone = phone.replace(/\D/g, '');
  if (phone.charAt(0) === '8') {
    // eslint-disable-next-line
    phone = `7${phone.substring(1)}`;
  }
  axios.get(`https://gateway.api.sc/get/?user=${sms.user}&pwd=${sms.password}&name_deliver=JRobot.pro&sadr=JRobot.pro&dadr=${phone}&text=Code: ${code}&callback_url=https://app.jrobot.pro/`);
  return true;
}

function sendSMS(phone, message) {
  // eslint-disable-next-line
  phone = phone.replace(/\D/g, '');
  if (phone.charAt(0) === '8') {
    // eslint-disable-next-line
    phone = `7${phone.substring(1)}`;
  }

  return axios.get(`https://gateway.api.sc/get/?user=${sms.user}&pwd=${sms.password}&name_deliver=JRobot.pro&sadr=JRobot.pro&dadr=${phone}&text=${message}&callback_url=https://app.jrobot.pro/`);
}

module.exports = {
  sendSMSWithCode,
  sendSMS,
};
