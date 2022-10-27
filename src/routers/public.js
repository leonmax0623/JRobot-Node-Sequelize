const Router = require('koa-router');
// const conf = require('../../config')
const logger = require('intel').getLogger('public-api');
const amoHooks = require('../amoCRM/hooks');
const amoApi = require('../amoCRM/api');
const random = require('../tools/random');
const hash = require('../tools/hashing');
const entryLink = require('../tools/entry-link');
const entries = require('../tools/entries');
const monitoringEvents = require('../tools/monitoring-events');

const { getCompanyData } = require('../dadata');
const { sendSMSWithCode, sendSMS } = require('../sms');

const HOST = process.env.HOST || 'https://app.jrobot.pro';

/**
 * Публичный роутер приложения.
 * Здесь методы регистрации, восстановления, авторизации etc
 */
const router = new Router();

// Регистрация
router.post('/register', async (ctx) => {
  // Разбираю по кусочкам тело запроса
  const {
    username,
    password,
    phone,
    promo,
    utm_term,
    utm_campaign,
    utm_source,
    utm_medium,
    utm_content,
    requestPresentation = false,
    name,
    surname,
    position,
    company,
    rate,
    period,
    inn,
    version,
  } = ctx.request.body;
  ctx.assert(username, 400, 'invalid_username');
  const existedUser = await ctx.memory.findUserByUsername(username);
  ctx.assert(!existedUser, 400, 'username_already_exists');
  const existedINN = await ctx.memory.findAccountByINN(inn);
  ctx.assert(!existedINN, 400, 'company_already_exist');

  // Ищу существующий аккаунт
  let accountName = `Account | ${username}`;
  if (company) {
    accountName = company;
  }
  const existedAccount = await ctx.memory.db.Account.findOne({
    where: { name: accountName },
  });
  ctx.assert(!existedAccount, 400, 'account_already_exists');

  try {
    // В единой транзакции провожу все операции по созданию аккаунта
    await ctx.db.sequelize.transaction(async () => {
      // Сам аккаунт
      const accountParams = { rate, period, company };
      if (version === 'new') {
        accountParams.premium_voices = 0;
      }
      const account = await ctx.memory.create.accountFromTemplate(
        accountName,
        null,
        accountParams,
        inn,
      );

      const passwordOut = password || await random.password(10);

      // Первый пользователь, администратор
      const user = await ctx.memory.create.user({
        role: 'admin',
        username,
        password: passwordOut,
        name,
        accountId: account.id,
        addToken: true,
        params: {
          phone, name, surname: surname || '', position: position || '',
        },
      });

      const amoCompanyId = await amoApi.createCompany(
        company,
        {
          inn, email: username, phone, name: (`${surname} ` || `${position}` || ''), companyName: company,
        },
      );

      // Данные для создания сделки в amoCRM
      const amoPayload = {
        password: passwordOut,
        utm_term,
        utm_campaign,
        utm_source,
        utm_medium,
        utm_content,
        email: username.toLowerCase(),
        phone,
        promo,
        requestPresentation,
        company,
        inn,
        name,
        surname: surname || '',
        position,
      };
      if (user.params && user.params.token) {
        amoPayload.token = user.params.token;
      }
      if (ctx.query.en === '1') {
        amoPayload.en = true;
      }

      // Создание ссылки для входа
      const [userEntryLink] = await Promise.all([
        entryLink.makeEntryLink({
          userId: user.id,
          fromRegistration: true,
          login: null,
          token: null,
          // next: 'trainer',
        }),
        // Создание сделки в amoCRM
        amoHooks.accountCreated(account, user, amoPayload, amoCompanyId),
        // Создание события регистрации для мониторинга в админке
        ctx.db.MonitoringEvent.create({
          type: monitoringEvents.types.ACCOUNT_REGISTERED,
          extra: {
            accountId: account.id,
          },
        }),
      ]);
      logger.info(`New password for ${username} is ${passwordOut}`);
      if (version === 'new') {
        ctx.body = { entryLink: userEntryLink };
      } else {
        ctx.body = { entryLink: HOST };
      }
      ctx.status = 201;
    });
  } catch (err) {
    logger.error(err);
    ctx.status = 500;
  }
});

// Восстановление доступа
router.post('/reset', async (ctx) => {
  const { username } = ctx.request.body;
  ctx.assert(username, 400, 'empty_username');
  const user = await ctx.memory.findUserByUsername(username);
  ctx.assert(user, 404, 'User not found');

  try {
    await ctx.mailer.resetUser(user);
  } catch (err) {
    logger.error(err);
    ctx.status = 500;
    return;
  }
  ctx.status = 204;
});

// Получение токена, авторизация
router.post('/auth-token', async (ctx) => {
  const {
    username, password, login, token,
  } = ctx.request.body;
  ctx.assert(username && password, 400, 'no_username_or_password');

  let user = null;
  if (login && token) {
    try {
      user = await ctx.memory.activateUser(login, token);
      ctx.assert(
        user && login.length > 0,
        400,
        'user_not_activated',
      );
    } catch (err) {
      logger.error(err);
    }
  } else {
    user = await ctx.memory.findUserByUsername(username);
  }

  ctx.assert(
    user && hash(password) === user.passwordHash,
    400,
    'invalid_username_or_password',
  );

  if (user.params && user.params.token) {
    ctx.assert(
      user && user.params.token_approved_at,
      400,
      'user_not_activated',
    );
  }

  const jwt = await ctx.memory.setSignJwt(user);
  ctx.body = { jwt };
});

// Использование ключа для входа для получения токена
router.post('/entry', async (ctx) => {
  if(ctx.request.body?.login && ctx.request.body?.token) {
    const { login, token } = ctx.request.body;
    try {
      const user = await ctx.memory.activateUser(login, token);
      ctx.assert(
          user && login.length > 0,
          400,
          'user_not_activated',
      );
    } catch (err) {
      logger.error(err);
    }
  }
  if(ctx.request.body?.key) {
    const { key } = ctx.request.body;
    try {
      const token = await entries.useEntryKey(key);
      ctx.body = {
        token: token,
      };
    } catch (e) {
      logger.warn('Entry failed:', e);
      ctx.throw(400, 'expired');
    }
  
    ctx.assert(key, 400, 'Empty key');
  }
});

// Данные о ценах по тарифам
router.get('/payment-rates', async (ctx) => {
  const rates = await ctx.db.PaymentRates.findOne();
  if (rates) {
    ctx.body = ['base', 'extended', 'professional', 'names', 'freeDays', 'freeHours', 'userCount', 'hourCount'].reduce(
      (prev, val) => {
        /* eslint-disable-next-line no-param-reassign */
        prev[val] = rates[val];
        // eslint-disable-next-line
        switch (true) {
          case val === 'names' && rates[val] === null:
            prev[val] = {
              base: 'Базовый',
              extended: 'Расширенный',
              professional: 'Профессиональный',
            };
            break;
          case val === 'userCount' && rates[val] === null:
            prev[val] = {
              base: 10,
              extended: 20,
              professional: 30,
            };
            break;
          case val === 'hourCount' && rates[val] === null:
            prev[val] = {
              base: 5,
              extended: 10,
              professional: 20,
            };
            break;
          case !rates[val]:
            prev[val] = 0;
            break;
        }
        return prev;
      },
      {},
    );
  } else {
    ctx.body = null;
    ctx.status = 204;
  }
});

// Планирование демонстрационной презентации в amoCRM
// deprecated?
router.post('/schedule-demo', async (ctx) => {
  const { phone, utm_term, datetime } = ctx.request.body;
  ctx.assert(phone && typeof phone === 'string', 400, 'Invalid phone');
  ctx.assert(!isNaN(new Date(datetime).getTime()), 400, 'Invalid date');
  await amoApi.createDemoLead({ phone, utm_term, datetime });
  ctx.status = 200;
});

// Поиск компании по ИНН или названию
router.post('/company-data', async (ctx) => {
  const { companyNameOrINN } = ctx.request.body;
  const data = await getCompanyData(companyNameOrINN);
  ctx.body = { data };
  ctx.status = 201;
});

// Отправка смс с кодом
router.post('/sms-send', async (ctx) => {
  const { phone } = ctx.request.body;

  if (ctx.session.sms_code && ctx.session.phone === phone) {
    ctx.body = { error: 'СМС с кодом уже отправлена!' };
    ctx.status = 201;
  }

  const sms_code = Math.floor(Math.random() * (99999 - 10000) + 10000);
  ctx.session.phone = phone;
  ctx.session.sms_code = sms_code;

  let data = false;
  if (process.env.NODE_ENV !== 'production') {
    logger.info(sms_code);
    data = true;
  } else {
    data = await sendSMSWithCode(phone, sms_code);
  }
  ctx.body = { data };
  ctx.status = 201;
});

// Проверка кода
router.post('/sms-check', async (ctx) => {
  const { sms_code } = ctx.request.body;
  logger.info(`${sms_code} == ${ctx.session.sms_code}`);
  // eslint-disable-next-line
  const data = (sms_code == ctx.session.sms_code);
  ctx.body = { data };

  if (data === true) {
    ctx.session = null;
  }
  ctx.status = 201;
});

router.get('/sms-test', async (ctx) => {
  const { phone, message, pwd } = ctx.query;

  if (pwd !== '1234567890') {
    ctx.body = { response: {} };
    ctx.status = 200;
    return;
  }

  try {
    const response = await sendSMS(phone, message);

    ctx.body = { body: response.data, headers: response.headers };
    ctx.status = 200;
  } catch (error) {
    ctx.body = { error: error.message };
    ctx.status = 500;
  }
});

module.exports = router;
