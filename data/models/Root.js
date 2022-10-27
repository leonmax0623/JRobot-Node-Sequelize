const hash = require('../../src/tools/hashing');

module.exports = (sequelize, DataTypes) => {
  // Администратор, имеющий доступ в админку JRobot
  const Root = sequelize.define('Root', {
    // имя пользователя
    username: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    // Почта, на которую отправляется код
    email: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    // Хэш ip, на который был выдан последний токен
    ipHash: DataTypes.STRING,
    // Хэш пароля, который был отправлен на почту
    secretHash: DataTypes.STRING,

    // Отправлять ли на почту фидбеки
    sendFeedbacks: DataTypes.BOOLEAN,
  }, {
    timestamps: false,
    setterMethods: {
      secret(value) {
        this.setDataValue('secretHash', hash(value));
      },
      ip(value) {
        this.setDataValue('ipHash', hash(value));
      },
    },
  });

  return Root;
};
