module.exports = (sequelize, DataTypes) => {
  // Группа пользователей внутри аккаунта
  const Group = sequelize.define('Group', {
    // Имя группы
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  });

  Group.associate = (models) => {
    // Принадлежит аккаунту
    models.Group.belongsTo(models.Account, { foreignKey: 'accountId' });

    // Имеет много пользователей
    models.Group.hasMany(models.User, { foreignKey: 'groupId' });

    // many-to-many ассоциация со сценариями
    models.Group.belongsToMany(models.Script, {
      through: 'GroupScript',
      foreignKey: 'groupId',
      as: {
        singular: 'Script',
        plural: 'Scripts',
      },
    });
  };

  return Group;
};
