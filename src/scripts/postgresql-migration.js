/* eslint-disable no-await-in-loop, no-console */

/**
 * Создано при версии 0.19.2
 * Миграция с SQLite на PosgreSQL. Корректный перенос всех данных
 */

// Это подключит особую конфигурацию в sequelize
process.env.NODE_ENV = 'migrating';

const sqlite = require('sqlite3');
const db = require('../../data/models');

const SQLITE_DB_PATH = 'data/dev.sqlite';

const ITEMS_LIMIT = 10000;
const sqliteDB = new sqlite.Database(SQLITE_DB_PATH);
const trans = {
  toDate: (v) => v && new Date(v),
  toBool: (v) => !!v,
  toNum: (v) => Number(v) || null,
  fromJSON: (v) => JSON.parse(v),
};
const Schema = {
  Account: {
    id: null,
    name: null,
    createdAt: trans.toDate,
    updatedAt: trans.toDate,
    status: null,
    timeLeft: null,
    deadline: trans.toDate,
    usersLimit: null,
    active: trans.toBool,
    leadId: null,
    speechRecognitionType: null,
    allowPaymentRequests: trans.toBool,
    remainingMonths: null,
    timePerMonth: null,
  },
  AmoLead: {
    id: null,
    info: trans.fromJSON,
  },
  Course: {
    id: null,
    accountId: null,
    createdAt: trans.toDate,
    updatedAt: trans.toDate,
    destroyedAt: trans.toDate,
    title: null,
    description: null,
  },
  CourseStep: {
    id: null,
    courseId: null,
    scriptId: null,
    createdAt: trans.toDate,
    updatedAt: trans.toDate,
    trainsCount: null,
    examsCount: null,
  },
  Entry: {
    uuid: null,
    userId: null,
    createdAt: trans.toDate,
    updatedAt: trans.toDate,
  },
  Group: {
    id: null,
    accountId: null,
    name: null,
    createdAt: trans.toDate,
    updatedAt: trans.toDate,
  },
  MonitoringEvent: {
    id: null,
    type: null,
    extra: trans.fromJSON,
    createdAt: trans.toDate,
  },
  PaymentRates: {
    id: null,
    createdAt: trans.toDate,
    updatedAt: trans.toDate,
    base: null,
    extended: null,
    professional: null,
    enterprise: null,
  },
  Replica: {
    id: null,
    sessionId: null,
    speakedAt: trans.toDate,
    text: null,
    author: null,
    record: null,
  },
  Report: {
    id: null,
    userId: null,
    cron: null,
  },
  Root: {
    id: null,
    username: null,
    ipHash: null,
    secretHash: null,
    email: null,
  },
  Script: {
    id: null,
    accountId: null,
    meta: trans.fromJSON,
    structure: trans.fromJSON,
    createdAt: trans.toDate,
    updatedAt: trans.toDate,
    destroyedAt: trans.toDate,
    orderNum: null,
  },
  Session: {
    id: null,
    createdAt: trans.toDate,
    accountId: null,
    userId: null,
    scriptId: null,
    courseId: null,
    success: trans.toBool,
    examination: trans.toBool,
    faults: null,
    duration: null,
    nodesBranch: null,
  },
  User: {
    id: null,
    accountId: null,
    groupId: null,
    createdAt: trans.toDate,
    updatedAt: trans.toDate,
    username: null,
    name: null,
    passwordHash: null,
    role: null,
    jwtIat: trans.toNum,
  },
  GroupScript: {
    groupId: null,
    scriptId: null,
    createdAt: trans.toDate,
    updatedAt: trans.toDate,
  },
  GroupCourse: {
    groupId: null,
    courseId: null,
    createdAt: trans.toDate,
    updatedAt: trans.toDate,
  },
};
const transOrder = [
  'Account',
  'Group',
  'User',
  'Script',
  'Course',
  'CourseStep',
  'GroupCourse',
  'GroupScript',
  'Entry',
  'Report',
  'Session',
  'Replica',
  'AmoLead',
  // 'MonitoringEvent',
  'PaymentRates',
  'Root',
];

main().catch(console.error);

async function main() {
  await Promise.all([
    db.sequelize.sync({ force: true }),
    new Promise((resolve) => {
      sqliteDB.serialize(resolve);
    }),
  ]);

  for (const model of transOrder) {
    try {
      await parseModel(model);
    } catch (err) {
      process.stdout.write('\n');
      console.error(err.message);
      break;
    }
  }

  db.sequelize.close();
  sqliteDB.close();
}

async function parseModel(modelName) {
  const tableName = (db[modelName] && db[modelName].tableName) || modelName;

  process.stdout.write(`${modelName}\n  1. Чтение...`);
  const rows = await new Promise((resolve, reject) => {
    sqliteDB.all(`select * from ${tableName}`, (err, data) => {
      err && reject(err);
      resolve(data);
    });
  });
  process.stdout.write(` завершено. Записей - ${rows.length}\n`);

  process.stdout.write('  2. Подготовка данных...');
  const colDefs = Object.entries(Schema[modelName]);
  const preparedRows = rows.map((row) => colDefs.reduce(
    (prev, [colName, transition]) => {
      const value = row[colName];
      prev[colName] = transition ? transition(value) : value;
      return prev;
    },
    {},
  ));
  process.stdout.write(' завершено\n');

  if (['GroupScript', 'GroupCourse'].includes(modelName)) {
    process.stdout.write('  3. Сохранение каждой записи по отдельности...');

    // await db.sequelize.query(`alter table "${tableName}" disable trigger all`);
    const columns = Object.keys(preparedRows[0]);
    const columnNames = columns
      .map((x) => `"${x}"`)
      .join(', ');
    for (const row of preparedRows) {
      const values = columns
        .map((col) => row[col]);
      await db.sequelize.query(
        `insert into "${tableName}" (${columnNames}) values (?)`,
        {
          replacements: [values],
          type: db.Sequelize.QueryTypes.INSERT,
        },
      );
    }
    // await db.sequelize.query(`alter table "${tableName}" enable trigger all`);

    process.stdout.write(' завершено.\n\n');
  } else {
    process.stdout.write('  3. Сохранение через sequelize...');
    // await db.sequelize.query(`alter table "${tableName}" disable trigger all`);
    {
      let index = 0;
      while (index < preparedRows.length) {
        process.stdout.cursorTo(35);
        process.stdout.write(`${index}/${preparedRows.length}`);
        const chunk = preparedRows.slice(index, index + ITEMS_LIMIT);
        index += ITEMS_LIMIT;
        await db[modelName].bulkCreate(chunk);
      }
    }
    // Выставление значения sequence
    const maxId = preparedRows.reduce((prev, { id: val }) => (val > prev ? val : prev), 0);
    if (maxId) {
      await db.sequelize.query(`alter sequence "${tableName}_id_seq" restart with ${maxId + 1}`);
    }
    // await db.sequelize.query(`alter table "${tableName}" enable trigger all`);
    process.stdout.cursorTo(34);
    process.stdout.write(' завершено.            \n\n');
  }
}
