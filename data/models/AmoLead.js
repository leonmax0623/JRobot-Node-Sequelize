module.exports = (sequelize, DataTypes) => {
  // Сделка в amoCRM. Имеет единственное поле info в JSON для наибольшей гибкости
  // id соответствует leadId в аккаунте, но явной связи между ними нет по историческим
  // причинам.
  const model = sequelize.define('AmoLead', {
    info: DataTypes.JSON,
  }, {
    timestamps: false,
  });

  return model;
};
