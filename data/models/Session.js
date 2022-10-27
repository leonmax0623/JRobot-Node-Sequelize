module.exports = (sequelize, DataTypes) => {
  // Данные о сессиях в тренажёре
  const Session = sequelize.define('Session', {
    // Завершена ли сессия успешно (пройдена ли до конца)
    success: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // Был ли это экзамен
    examination: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // Сколько ошибок совершено
    faults: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    // Какая длительность
    duration: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    // Ветка узлов, по которой шёл пользователь (`id id id id`)
    // Используется для статистики gradualPassageMode и "умного ветвления",
    // не повторяемости веток
    nodesBranch: {
      type: DataTypes.TEXT,
      defaultValue: null,
    },
    // Относительное конечное значение скрытых слов при прохождении (от 0 до 1)
    trueHiddenWordsValue: {
      type: DataTypes.REAL,
      defaultValue: null,
    },
  }, {
    timestamps: true,
    updatedAt: false,
  });

  Session.associate = function (models) {
    // Имеет много реплик
    Session.hasMany(models.Replica, { as: 'Replicas', foreignKey: 'sessionId' });

    // Связано с одним пользователем, аккаунтом и сценариев
    Session.belongsTo(models.User, { foreignKey: 'userId' });
    Session.belongsTo(models.Script, { foreignKey: 'scriptId' });
    Session.belongsTo(models.Account, { foreignKey: 'accountId' });
  };

  return Session;
};
