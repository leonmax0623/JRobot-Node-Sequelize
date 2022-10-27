module.exports = (sequelize) => {
  // Модель, через которую формируется порядок сценариев в аккаунте
  // То, в каком порядке расположены строки этой таблицы, и является показателем порядка
  const Model = sequelize.define('AccountScriptOrder', {
    // Пусто
  }, {
    timestamps: false,
  });

  Model.removeAttribute('id');

  Model.associate = function (models) {
    Model.belongsTo(models.Script, {
      foreignKey: 'scriptId',
      onDelete: 'CASCADE',
    });
    Model.belongsTo(models.Account, {
      foreignKey: 'accountId',
      onDelete: 'CASCADE',
    });
  };

  return Model;
};
