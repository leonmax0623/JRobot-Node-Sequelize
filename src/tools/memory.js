const jwt = require('jsonwebtoken');
const db = require('../../data/models');
const hash = require('./hashing');
const config = require('../../config');
const uuidv4 = require('uuid/v4');

const { Op } = db.Sequelize;

/**
 * В данном модуле собрана коллекция не слишком друг с другом связанных
 * функций для работы с БД.
 */
module.exports = {
  db,
  Op,
  create: {
    account: createAccount,
    accountFromTemplate: createAccountFromTemplate,
    user: createUser,
    script: createScript,
    scriptsCopy: createScriptsCopy,
    // replica: createReplica,
    // session: createSession,
  },
  update: {
    user: updateUser,
    script: updateScript,
  },
  destroyUser,
  destroyScript,
  archiveScript,
  unarchiveScript,
  destroyAccount,

  setSignJwt,
  decreaseAccountTimeLeft,
  findUserByUsername,
  findAccountByINN,
  activateUser,
  isAccountActive,
  periodCondition,
  sqlDatetime,
  examinationProgress,
  select,
  getLibraryScripts,
};

/**
 * Поиск пользователя по логину
 * @param {string} username
 */
async function findUserByUsername(username) {
  // Экранирование спец. символов
  const pattern = String(username).replace(/([%_])/g, '\\$1');

  const user = await db.User.findOne({
    where: {
      username: { [Op.iLike]: pattern },
    },
  });
  return user;
}

async function findAccountByINN(inn) {
  const pattern = String(inn).replace(/([%_])/g, '\\$1');

  const account = await db.Account.findOne({
    where: {
      inn: { [Op.iLike]: pattern },
    },
  });

  return account;
}

/**
 * Поиск по токену и активация его
 */
async function activateUser(username, token) {
  const user = await db.User.findOne({
    where: {
      username,
      'params.token': token,
    },
  });
  if (user && user.params.token_approved_at.length === 0) {
    const { params } = user;
    params.token_approved_at = new Date();
    await user.update({ params });
  }
  return user;
}
/**
 * Создание аккаунта с исходными данными
 * @param {string} name - имя аккаунта
 * @param {number|string} leadId - id сделки в amoCRM (опционально)
 * @param {object|null} params - Параметры (опционально)
 * @param {string} inn - Параметры (опционально)
 */
async function createAccount(name, leadId = null, params = null, inn) {
  const date = new Date();
  let freeDays = 7;
  let freeHours = 50;
  const rates = await db.PaymentRates.findOne();
  if (rates) {
    freeDays = rates.freeDays;
    freeHours = rates.freeHours;
  }
  date.setDate(date.getDate() + freeDays);
  const acc = await db.Account.create({
    name,
    status: 'test',
    // Исходный остаток времени - 50 часов (теперь определяется в Админке)
    timeLeft: 3600 * 1e3 * freeHours,
    deadline: date,
    active: true,
    leadId,
    speechRecognitionType: 'auto',
    allowPaymentRequests: true,
    params,
    inn,
  });
  return acc;
}

/**
 * Создание пользователя. Делает хэш из пароля.
 */
async function createUser({
  role,
  username,
  password,
  name,
  accountId,
  groupId,
  addToken,
  params,
}) {
  const data = {
    role,
    username: username.toLowerCase(),
    passwordHash: hash(password),
    name,
    accountId,
    groupId,
    params,
  };
  if (addToken) {
    data.params.token = uuidv4();
    data.params.token_approved_at = '';
  }
  const user = await db.User.create(data);
  return user;
}

async function createScript(initialData, account = null) {
  const script = await db.Script.create(initialData);
  if (account) {
    account.addScript(script);
  }
  return script;
}

async function createScriptsCopy(scripts) {
  const copies = await db.Script.bulkCreate(scripts.map(
    (x) => {
      const { structure, meta } = x.dataValues;
      return { structure, meta };
    },
  ));
  return copies;
}

/**
 * Корректно обновляет данные пользователя
 * @param {*} user - Пользователь
 * @param {*} data - Данные
 * @param {Boolean} expireToken - Сжечь ли старый токен
 */
async function updateUser(user, data, expireToken = false) {
  const updates = {};
  if ('username' in data && data.username) {
    updates.username = data.username.toLowerCase();
  }
  if ('role' in data && data.role) {
    updates.role = data.role;
  }
  if ('name' in data) {
    updates.name = data.name;
  }
  if ('password' in data && data.password) {
    updates.passwordHash = hash(data.password);
    if (expireToken) {
      updates.jwtIat = null;
    }
  }
  if ('groupId' in data) {
    updates.groupId = data.groupId;
  }
  if ('params' in data) {
    updates.params = data.params;
  }
  await user.update(updates);
}

function destroyUser(user) {
  return user.destroy();
}

/**
 * Корректно обновляет данные скрипта
 * @param {*} script - Скрипт
 * @param {*} data - Данные
 * @param {*} isRoot - если из админки правка
 */
async function updateScript(script, data, isRoot) {
  let updates = {};

  if ('public' in data) {
    updates.public = data.public;
  }
  if (isRoot) {
    updates = data;
  }
  await script.update(updates);
}

function destroyScript(scr, { force = false } = {}) {
  if (force) {
    return scr.destroy();
  }
  return scr.update({
    destroyedAt: new Date(),
  });
}

function archiveScript(scr) {
  return scr.update({
    archivedAt: new Date(),
  });
}

function unarchiveScript(scr) {
  return scr.update({
    archivedAt: null,
  });
}

/**
 * Удаление аккаунта со всеми сопутствующими данным (кроме сессий)
 * @param {*} account
 */
async function destroyAccount(account) {
  await db.sequelize.transaction(async () => {
    const { id: accountId } = account;

    // await db.sequelize.query(
    //   `delete from "CourseSteps" where "courseId" in (
    //     select id from "Courses"
    //     where "accountId" = ${accountId}
    //   )`,
    // );

    await Promise.all([
      db.User.destroy({ where: { accountId } }),
      db.Script.destroy({ where: { accountId } }),
      // db.Course.destroy({ where: { accountId } }),
    ]);

    await account.destroy();
  });
}

/**
 * Определяет, является ли аккаунт активным, доступны ли ему подключения к тренажёру.
 * Важная функция, используемая много где.
 * @param {number|string} accountId - id аккаунта
 */
async function isAccountActive(accountId) {
  const account = await db.Account.findByPk(accountId);
  const {
    active,
    timeLeft,
    deadline,
    partner,
  } = account;

  // Вот по таким вот условиям аккаунт активен
  // TODO: для тестирования аккаунта на активность, нужно изменить условие
  if (process.env.NODE_ENV == 'production') {
    return active && (
        partner
        || (
            timeLeft > 0
            // Сравнение по дате (дню), не по времени
            && new Date().setHours(0, 0, 0, 0) <= new Date(deadline).setHours(0, 0, 0, 0)
        )
    );
  } else {
    return true;
  }
}

/**
 * Снижение остатка времени в аккаунте
 * @param {number} accountId - id аккаунта
 * @param {number} ms - время, которое вычитать
 */
async function decreaseAccountTimeLeft(accountId, ms) {
  const account = await db.Account.findByPk(accountId);
  let current = account.timeLeft;
  // на всякий случай
  current -= ms > 0 ? ms : 0;
  current = current < 0 ? 0 : current;
  await account.update({ timeLeft: current });
}

/**
 * Создание токена для пользователя и сохранение времени его создания
 * @param {*} user
 * @returns {Promise<string>}
 */
async function setSignJwt(user) {
  const iat = Date.now();
  await user.update({ jwtIat: iat });
  return jwt.sign(
    {
      uid: user.dataValues.id,
      iat,
    },
    config.app.secret,
  );
}

/**
 * Создание аккаунта из шаблона. Шаблон - специальный аккаунт с именем 'template' в базе данных.
 * Его сценарии и подписки будут перенесены в новый аккаунт.
 *
 * @param {string} name - имя будущего аккаунта
 * @param {number} leadId - id сделки в amoCRM (опционально)
 * @param {object|null} params - дополнительные параметры (опционально)
 * @param {string} inn - ИНН
 */
async function createAccountFromTemplate(name, leadId = null, params = null, inn) {
  const account = await createAccount(name, leadId, params, inn);
  const template = await db.Account.findOne({
    where: { name: 'template' },
  });

  if (template) {
    const [
      templateScripts,
      templatePartnerScripts,
    ] = await Promise.all([
      template.getScripts(),
      select(`select "scriptId" id from "AccountPartnerScript" where "accountId" = ${template.id}`),
    ]);

    await account.setPartnerScripts(templatePartnerScripts.map(({ id }) => id));

    // Копирование сценариев
    await db.Script.bulkCreate(
      templateScripts.map(({ meta, structure }) => ({
        meta,
        structure,
        accountId: account.id,
      })),
    );
  }

  return account;
}

/**
 * Подсчёт прогресса прохождения экзамена пользователей(-ля) по сценариям(-ю).
 * Можно указать аккаунт, группу, пользователя и сценарий,
 * промежуток времени и только ли по студентам считать.
 *
 * @typedef {{ userId?: number, scriptId: number, passed: number, required: number }} Progress
 * @returns {Promise<Progress[]>}
 */
async function examinationProgress({
  accountId = null,
  userId = null,
  groupId = null,
  scriptId = null,
  fromDate = null,
  toDate = null,
  onlyStudents = false,
} = {}) {
  /* eslint-disable no-param-reassign */
  if (fromDate instanceof Date) {
    fromDate = sqlDatetime(fromDate);
  }
  if (toDate instanceof Date) {
    toDate = sqlDatetime(toDate);
  }
  /* eslint-enable */
  const res = await db.sequelize.query(`
    SELECT
      ${accountId || groupId ? 'usr.id "userId",' : ''}
      scr.id "scriptId",
      sum(
        case when (
          ss.examination = true
          and ss.success = true
          and (
            scr.meta#>'{examination, allowedFaults}' is null
            or (scr.meta#>>'{examination, allowedFaults}')::integer >= ss.faults
          ) and (
            scr.meta#>'{examination, allowedDuration}' is null
            or (scr.meta#>>'{examination, allowedDuration}')::integer >= ss.duration
          )
        ) then 1 else 0 end
      ) passed,
      (scr.meta#>>'{examination, requiredPasses}')::integer required
    FROM
      "Users" usr
      join "Sessions" ss on usr.id = ss."userId"
      join "Scripts" scr on ss."scriptId" = scr.id
    WHERE
      scr.id ${scriptId ? `= ${scriptId}` : 'is not null'} AND
      (scr.meta::json->>'gradualPassageMode')::bool is not true AND
      ${toDate !== null ? `ss."createdAt" <= ${toDate} AND` : ''}
      ${fromDate !== null ? `ss."createdAt" >= ${fromDate} AND` : ''}
      ${accountId !== null ? `usr."accountId" = ${accountId} AND` : ''}
      ${groupId !== null ? `usr."groupId" = ${groupId} AND` : ''}
      ${userId !== null ? `usr.id = ${userId} AND` : ''}
      ${onlyStudents ? 'usr.role = \'student\' AND' : ''}
      scr.meta#>'{examination, requiredPasses}' is not null
    GROUP BY usr.id, scr.id
  `, {
    type: db.Sequelize.QueryTypes.SELECT,
  });
  return res;
}

/**
 * Преобразование даты в то, что можно подставить в SQL-запрос.
 * В данном случае на диалекте PostgreSQL.
 *
 * @param {Date} date
 * @returns {string}
 */
function sqlDatetime(date) {
  return `to_timestamp(${date.getTime()} / 1000)`;
}

/**
 * Функция-shorthand для SELECT запросов.
 */
async function select(query, { one = false } = {}) {
  const selected = await db.sequelize.query(query, {
    type: db.Sequelize.QueryTypes.SELECT,
  });
  return one ? selected[0] : selected;
}

/**
 * Формирует условие совпадения по дате для использования в SQL-запросах. Например:
 *
 * - "createdAt" between <1> and <2>
 * - "Sessions"."createdAt" >= <1>
 *
 * @param {string} columnName - колонка со временем
 * @param {{ start?: Date|number, end:? Date|number }} param1 - Интервал
 * @returns {String} - итоговое условие
 */
function periodCondition(columnName, { start, end }) {
  if (!start && !end) return null;

  const startDate = start
    ? start instanceof Date
      ? sqlDatetime(start)
      : sqlDatetime(new Date(start))
    : null;
  const endDate = end
    ? end instanceof Date
      ? sqlDatetime(end)
      : sqlDatetime(new Date(end))
    : null;

  if (startDate && endDate) return `${columnName} between ${startDate} and ${endDate}`;
  if (startDate) return `${columnName} >= ${startDate}`;
  return `${columnName} <= ${endDate}`;
}

/**
 * Специальный запрос для получения сценариев в "библиотеке". То есть публичных,
 * не удалённых сценариев из партнёрских аккаунтов. Можно указать категорию.
 *
 * @typedef {{
 * id: number,
 * meta: any,
 * partnerName: string,
 * partnerScriptCategoryId: number }} LibScriptInfo
 * @param {{ categoryId?: number }}
 * @returns {Promise<Array<LibScriptInfo>>}
 */
function getLibraryScripts({ categoryId = null } = {}) {
  return select(`
    select
      "Scripts".id id,
      meta,
      "Accounts".name "partnerName",
      "partnerScriptCategoryId"
    from
      "Scripts"
      join "Accounts" on "Accounts".id = "Scripts"."accountId"
    where
      "Accounts".partner
      and "Scripts".public
      and "Scripts"."destroyedAt" is null
      ${categoryId ? `and "Scripts"."partnerScriptCategoryId" = ${categoryId}` : ''}
  `);
}
