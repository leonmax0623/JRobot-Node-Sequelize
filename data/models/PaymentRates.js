module.exports = (sequelize, DataTypes) => {
  // Модель, представляющая закупочные цены
  // По умолчанию считается, что в БД только одна строка в этой таблице
  const model = sequelize.define('PaymentRates', {
    // Цена на базовый тариф
    base: DataTypes.INTEGER,
    // расширенный
    extended: DataTypes.INTEGER,
    // профессиональный
    professional: DataTypes.INTEGER,
    // корпоративный (не используется, исторический артефакт)
    enterprise: DataTypes.INTEGER,
    // Названия тарифов (опционально)
    names: DataTypes.JSONB,
    // Количество бесплатных дней
    freeDays: DataTypes.INTEGER,
    // Количество бесплатных часов
    freeHours: DataTypes.INTEGER,
    // Количество пользователей для тарифов (опционально)
    userCount: DataTypes.JSONB,
    // Количество часов для тарифов (опционально)
    hourCount: DataTypes.JSONB,
  });

  return model;
};
