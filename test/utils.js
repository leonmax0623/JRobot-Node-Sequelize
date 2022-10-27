const memory = require('../src/tools/memory');

const { db } = memory;

/**
 * Применение truncate ко всем этим моделям
 * @param  {...string} models - модели
 */
async function truncateModels(...models) {
  const modelNames = models
    .map((name) => `"${name in db ? db[name].tableName : name}"`)
    .join(', ');
  await db.sequelize.query(`truncate table ${modelNames} cascade`);
}

/**
 * Удаляет все объекты
 * @param  {...any} instances - объекты
 */
async function destroyInstances(...instances) {
  await Promise.all(instances.map((x) => x.destroy()));
}

/**
 * Создаёт сессии одним бульком, примешивая в каждому item миксин
 *
 * @param {Array} items - сессии
 * @param {any} mixin - миксин
 */
async function createSessions(items, mixin = {}) {
  const defaults = {
    createdAt: 'now()',
    scriptId: null,
    accountId: null,
    userId: null,
    courseId: null,
    examination: false,
    success: false,
    duration: 0,
    faults: 0,
  };

  const columns = Object.keys(defaults);

  const values = items.map((item) => {
    const data = {
      ...defaults,
      ...item,
      ...mixin,
    };

    if (data.createdAt instanceof Date) {
      data.createdAt = memory.sqlDatetime(data.createdAt);
    }

    return `(${columns.map((col) => String(data[col])).join(',')})`;
  });

  const [createdItems] = await db.sequelize.query(`
    insert into "Sessions"
    (${columns.map((col) => `"${col}"`).join(',')})
    values
    ${values.join(',\n    ')}
    returning *
  `);
  return createdItems;
}

module.exports = { truncateModels, destroyInstances, createSessions };
