module.exports = (sequelize, DataTypes) => {
  const Account = sequelize.define('Account', {
    // Название аккаунта
    name: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    // ИНН
    inn: {
      type: DataTypes.STRING,
      unique: true,
    },
    // Статус аккаунта
    status: {
      type: DataTypes.ENUM('live', 'test'),
      allowNull: false,
      defaultValue: 'test',
    },
    // Является ли аккаунт партнёрским
    partner: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // Остаток времени для тренировок. То есть, сколько ещё миллисекунд можно заниматься.
    timeLeft: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
    },
    // Дедлайн, после которого заниматься на тренажёре нельзя, даже если есть остаток.
    deadline: {
      type: DataTypes.DATE,
      defaultValue: null,
    },
    // Лимит пользователей на аккаунт
    usersLimit: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    // Активен ли аккаунт. Если нет, то заниматься невозможно.
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // ID сделки в amoCRM
    leadId: DataTypes.BIGINT,
    /**
     * Тип распознавания речи, доступный для аккаунта
     * - app - только серверное
     * - native - только нативное, браузерное
     * - auto - автоматически. Если доступно нативное, то нативное, иначе серверное.
     */
    speechRecognitionType: {
      type: DataTypes.ENUM('app', 'native', 'auto'),
      defaultValue: 'native',
    },
    // Разрешено ли аккаунту делать запросы на покупку
    allowPaymentRequests: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    /**
     * Количество оставшихся месяцев.
     * Когда приходит время дедлайна, сервер смотрит, есть ли ещё месяцы.
     * Если есть, то дедлайн переносится на 30 дней, количество
     * месяцев уменьшается на единицу и timeLeft устанавливается в
     * timePerMonth
     */
    remainingMonths: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    /**
     * Время, которое даётся аккаунту на месяц.
     * Устанавливается при переносе дедлайна на месяц вперёд.
     */
    timePerMonth: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
    },
    /**
     * Когда аккаунт получил статус live
     * (используется для партнёрской статистики)
     */
    becomedLiveAt: DataTypes.DATE,
    // Параметры (опционально)
    params: DataTypes.JSONB,
  });

  Account.associate = function (models) {
    // Пользователи аккаунта
    Account.hasMany(models.User, { foreignKey: 'accountId' });

    // Сценарии аккаунта
    Account.hasMany(models.Script, { foreignKey: 'accountId' });

    // Сессии аккаунта
    Account.hasMany(models.Session, { foreignKey: 'accountId' });

    // Партнёрские сценарии, привязанные к аккаунту
    Account.belongsToMany(models.Script, {
      through: 'AccountPartnerScript',
      foreignKey: 'accountId',
      as: {
        singular: 'PartnerScript',
        plural: 'PartnerScripts',
      },
    });
  };

  return Account;
};
