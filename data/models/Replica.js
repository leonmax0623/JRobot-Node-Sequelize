module.exports = (sequelize, DataTypes) => {
  // Реплика в сессии
  const Replica = sequelize.define('Replica', {
    // Текст реплики
    text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // Автор реплики (bot или user)
    author: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    // Запись в формате audio/ogg
    record: {
      type: DataTypes.BLOB,
      defaultValue: null,
    },
    recognitionType: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    timestamps: true,
    updatedAt: false,
    createdAt: 'speakedAt',
  });

  Replica.associate = function (models) {
    Replica.belongsTo(models.Session, { foreignKey: 'sessionId' });
  };

  return Replica;
};
