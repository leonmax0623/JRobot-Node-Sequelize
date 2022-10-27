module.exports = (sequelize, DataTypes) => {
  // Собственно, пользователь
  const User = sequelize.define('User', {
    // логин, он же e-mail
    username: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    // Имя, которое отображается вместо логина для удобства
    name: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    // Хэш пароля
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    // Роль. Админ самый главные, менеджер только в группе
    // может пользователями управлять, студент только заниматься
    role: {
      type: DataTypes.ENUM('manager', 'student', 'admin'),
      defaultValue: 'admin',
      allowNull: false,
    },
    // Время, в которое был подписан JWT-токен на пользователя
    jwtIat: {
      type: DataTypes.BIGINT,
      defaultValue: null,
    },
    // Параметры (опционально)
    params: DataTypes.JSONB,
  });

  User.associate = function (models) {
    // Имеет много сессий
    models.User.hasMany(models.Session, { as: 'Sessions', foreignKey: 'userId' });
    // Может принадлежать одной группе
    models.User.belongsTo(models.Group, { foreignKey: 'groupId' });
  };

  return User;
};
