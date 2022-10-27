module.exports = (sequelize, DataTypes) => {
  // Категории партнёрских сценариев
  const model = sequelize.define('PartnerScriptCategory', {
    // Название категории
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  }, {
    timestamps: false,
  });

  return model;
};
