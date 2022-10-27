const axios = require('axios').default;
const logger = require('intel').getLogger('dadata');

const { dadata: { token } } = require('../../config');

async function getCompanyData(companyName) {
  const url = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party';

  const data = {
    query: companyName,
  };

  const config = {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Token ${token}`,
    },
  };

  const response = await axios.post(url, data, config);

  if (response?.data?.suggestions.length) {
    return await response.data.suggestions.map((item) => ({
      inn: item.data.inn,
      name: item.data.name.short_with_opf,
    }));
  }
}

module.exports = {
  getCompanyData,
};
