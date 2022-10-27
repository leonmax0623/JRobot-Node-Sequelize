module.exports = (sequelize, DataTypes) => {
  // Прикрепление в фидбеку пользователя
  const FeedbackAttachment = sequelize.define('FeedbackAttachment', {
    // Данные, блоб
    data: {
      type: DataTypes.BLOB,
      allowNull: false,
    },
    // Тип данных, mime
    type: {
      type: DataTypes.STRING,
    },
    // Оригинальное название файла
    name: {
      type: DataTypes.STRING,
    },
  });

  FeedbackAttachment.associate = (models) => {
    // Относится к одному фидбеку
    models.FeedbackAttachment.belongsTo(models.Feedback, { foreignKey: 'feedbackId' });
  };

  return FeedbackAttachment;
};
