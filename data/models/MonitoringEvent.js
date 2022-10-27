module.exports = (sequelize, DataTypes) => {
  // Эта модель используется для метрик в админке
  const Model = sequelize.define('MonitoringEvent', {
    // Тип события
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    // Дополнительная информация о событии
    extra: DataTypes.JSON,
  }, {
    timestamps: true,
    updatedAt: false,
  });

  // Model.associate = function (models) {
  //   Model.belongsTo(models.User, { foreignKey: 'userId' });
  //   Model.belongsTo(models.Script, { foreignKey: 'scriptId' });
  //   Model.belongsTo(models.Account, { foreignKey: 'accountId' });
  //   Model.belongsTo(models.Course, { foreignKey: 'courseId' });
  //   Model.belongsTo(models.Course, { foreignKey: 'courseId' });
  // };

  return Model;
};
