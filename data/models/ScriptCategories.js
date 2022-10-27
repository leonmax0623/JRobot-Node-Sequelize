module.exports = (sequelize, DataTypes) => {
  // Категории сценариев
  const model = sequelize.define('ScriptCategories', {
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
