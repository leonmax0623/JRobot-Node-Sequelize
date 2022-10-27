module.exports = (sequelize, DataTypes) => {
  // Ключ для входа на сайт. Через него пользователям выдаются токены без
  // авторизации через логин/пароль
  const Entry = sequelize.define('Entry', {
    uuid: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      primaryKey: true,
    },
  });

  Entry.associate = function (models) {
    Entry.belongsTo(models.User, { foreignKey: 'userId' });
  };

  return Entry;
};
