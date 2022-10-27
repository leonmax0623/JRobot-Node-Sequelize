const crypto = require('crypto');

const lettersPool = [];
for (let i = 'A'.charCodeAt(0), end = 'Z'.charCodeAt(0); i <= end; i += 1) {
  lettersPool.push(String.fromCharCode(i));
}
for (let i = 'a'.charCodeAt(0), end = 'z'.charCodeAt(0); i <= end; i += 1) {
  lettersPool.push(String.fromCharCode(i));
}
lettersPool.push(...'0123456789.,!?=-^&*@#$%'.split(''));

const index = (array) => ~~(Math.random() * array.length);

const choice = (array) => array[index(array)];

const string = (len) => {
  const arr = [];
  let i = len;
  while (i > 0) {
    arr.push(choice(lettersPool));
    i -= 1;
  }
  return arr.join('');
};

const password = (length) => new Promise((resolve, reject) => {
  crypto.randomBytes(length, (err, buf) => {
    if (err) {
      reject(err);
    } else {
      const bytes = [...buf];
      const letters = bytes.map((x) => lettersPool[~~((x / 256) * lettersPool.length)]);
      resolve(letters.join(''));
    }
  });
});

/**
 * Модуль с рандомными функциями
 */
module.exports = {
  index,
  choice,
  string,
  password,
};
