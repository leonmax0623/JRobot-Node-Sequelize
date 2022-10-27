const crypto = require('crypto');

/**
 * Просто делает хэш
 */
module.exports = (value) => crypto
  .createHash('sha256')
  .update(value)
  .digest('base64');
