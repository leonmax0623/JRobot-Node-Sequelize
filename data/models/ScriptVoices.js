module.exports = (sequelize, DataTypes) => {
  // Записи голосов для сценария
  const model = sequelize.define('ScriptVoices', {
    scriptId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    voiceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    replicaId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    filePath: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  });

  model.associate = function (models) {
    // Принадлежит скриптам
    models.ScriptVoices.hasMany(models.Script, {as: 'Scripts', foreignKey: 'scriptId'});
    // Может иметь категории
    models.ScriptVoices.hasOne(models.Voices, { foreignKey: 'voiceId' });
  };

  return model;
};
