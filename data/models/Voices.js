module.exports = (sequelize, DataTypes) => {
  // Голос для сценария
  const model = sequelize.define('Voices', {
    // Название голоса
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    gender: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    speed: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    emotion: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  });

  return model;
};
