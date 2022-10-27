const jwt = require('jsonwebtoken');
const db = require('../../data/models');
const config = require('../../config');
// const hash = require('../tools/hashing');

/**
 * Авторизация пользователя, который подключается
 * @param {string} token
 * @returns {Promise<any>} пользователь из БД
 */
async function verify(token) {
  // Парсинг JWT токена, извлечение
  // uid - id пользователя
  // iat - время подписи токена
  const { uid, iat } = await new Promise((resolve, reject) => {
    jwt.verify(token, config.app.secret, (err, payload) => {
      if (err) {
        reject(err);
      } else {
        resolve(payload);
      }
    });
  });

  // Ищу пользователя с этим uid
  const user = await db.User.findByPk(uid);
  if (!user) {
    throw new Error('User not found');
  }
  // jwtIat у пользователя должен совпадать с тем, что в токене
  if (user.jwtIat !== iat) {
    throw new Error('IAT invalid');
  }

  // Всё ок.
  return user;
}

module.exports = { verify };
