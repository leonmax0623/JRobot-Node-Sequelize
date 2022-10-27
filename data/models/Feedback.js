module.exports = (sequelize, DataTypes) => {
  // Фидбек пользователя
  const Feedback = sequelize.define('Feedback', {
    // Сообщение пользователя, текст обращения
    message: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    // Данные для связи (опционально)
    contact: {
      type: DataTypes.STRING,
    },
  });

  Feedback.associate = (models) => {
    // Относится к одному пользователю
    models.Feedback.belongsTo(models.User, { foreignKey: 'userId' });

    // Может иметь много прикреплений
    models.Feedback.hasMany(models.FeedbackAttachment, { foreignKey: 'feedbackId' });
  };

  return Feedback;
};
