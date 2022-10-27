const intel = require('intel');

intel.addHandler(new intel.handlers.Null());
process.env.NODE_ENV = 'test';

module.exports = {};
