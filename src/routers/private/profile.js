const logger = require('intel').getLogger('private-profile-api');
const entryLink = require('../../tools/entry-link');
const mailer = require('../../tools/mailer');

async function reSendVerificationLink(username, userEntryLink) {
  await mailer.sendMail({
    to: username,
    subject: 'Повтор ссылки для подтверждения аккаунта в системе JRobot.Pro',
    html: `<h4>Здравствуйте!</h4><br/><p>Дублируем письмо со ссылкой для подтверждения вашего аккаунта на JRobot. </p><br/><h3><a href="${userEntryLink}">НАЖМИТЕ СЮДА</a></h3><br/><p>Желаем приятного пользования и великолепных результатов в адаптации сотрудников и продажах!</p><br/><br/><p>Мы на связи:<br/><a href="mailto:hello@jrobot.pro">hello@jrobot.pro</a><br/>Telegram: <a href="https://t.me/jrobot_pro">@jrobot_pro</a></p>`,
  });
}

module.exports = [
  {
    path: '/profile',
    method: 'get',
    /**
     * Получение данных профиля.
     * Имя, username, роль, данные аккаунта.
     */
    async handler(ctx) {
      // @todo сделать тут валидацию пользлвателей

      const {
        id, role, username, name, groupId, accountId,
      } = ctx.state.user;

      let verified = true;
      if (ctx.state.user.params && ctx.state.user.params.token && ctx.state.user.params.token_approved_at === '') {
        verified = false;
      }

      let hideWordsMode = '';
      if (ctx.state.user.params && ctx.state.user.params.hideWordsMode) {
        hideWordsMode = ctx.state.user.params.hideWordsMode;
      }

      let gender = '';
      if (ctx.state.user.params && ctx.state.user.params.gender) {
        gender = ctx.state.user.params.gender;
      }

      let emotion = '';
      if (ctx.state.user.params && ctx.state.user.params.emotion) {
        emotion = ctx.state.user.params.emotion;
      }

      let speed = '';
      if (ctx.state.user.params && ctx.state.user.params.speed) {
        speed = ctx.state.user.params.speed;
      }

      ctx.body = {
        id, role, username, name, verified, hideWordsMode, gender, emotion, speed,
      };
      if (groupId) {
        const group = await ctx.db.Group.findByPk(groupId);
        if (group) {
          ctx.body.grouped = true;
          ctx.body.groupName = group.name;
        }
      }

      // Информация об аккаунте
      const [active] = await Promise.all([
        // ctx.db.Account.findByPk(accountId),
        ctx.memory.isAccountActive(accountId),
      ]);
      ctx.body.account = {
        active,
        ...getAccountInfo(ctx.state.account, role),
      };
    },
  },
  {
    path: '/profile',
    method: 'patch',
    async handler(ctx) {
      const allowedFields = ['name', 'username', 'password'];
      const data = Object.entries(ctx.request.body)
        .filter(([key]) => allowedFields.includes(key))
        .reduce((item, [key, value]) => {
          /* eslint-disable-next-line no-param-reassign */
          item[key] = value;
          return item;
        }, {});
      ctx.assert(Object.keys(data).length, 400, 'no_data');
      if ('password' in data) {
        ctx.assert(data.password, 400, 'empty_password');
      }
      if ('username' in data) {
        ctx.assert(data.username, 400, 'empty_username');
        const existed = await ctx.memory.findUserByUsername(data.username);
        ctx.assert(!existed, 400, 'username_already_exists');
      }

      await ctx.memory.update.user(ctx.state.user, data, false);
      ctx.status = 204;
    },
  },
  {
    path: '/profile/send-verification-mail',
    method: 'post',
    async handler(ctx) {
      const {
        id, username, params,
      } = ctx.state.user;

      const [userEntryLink] = await Promise.all([
        entryLink.makeEntryLink({
          userId: id,
          fromRegistration: false,
          login: username,
          token: params.token,
        }),
      ]);

      if (process.env.NODE_ENV === 'production') {
        await reSendVerificationLink(username, userEntryLink);
      } else {
        ctx.body = { userEntryLink };
        logger.info(userEntryLink);
      }
      ctx.status = 200;
    },
  },
];

/**
 * Данные из аккаунта в соответствии с ролью запрашиваемого
 * @param {any} account Аккаунт из базы
 * @param {string} role Роль запрашиваемого пользователя
 */
function getAccountInfo(account, role) {
  const {
    name,
    speechRecognitionType,
  } = account;
  const data = {
    name,
    speechRecognitionType,
  };

  // Если админ, то полную информацию об аккаунте
  // Иначе достаточно имени и типа распознавания (для выставления его на фронте)
  if (role === 'admin') {
    for (const key of [
      'name',
      'deadline',
      'timeLeft',
      'allowPaymentRequests',
      'usersLimit',
      'remainingMonths',
      'timePerMonth',
      'partner',
      'speechRecognitionType',
      'params',
    ]) {
      data[key] = account[key];
    }
    // Оплата доступна, когда есть leadId и разрешение
    data.allowPaymentRequests = data.allowPaymentRequests && !!account.leadId;
  }

  return data;
}
