module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.addColumn('Accounts', 'partner', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    }, { transaction });
    await queryInterface.addColumn('Scripts', 'public', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    }, { transaction });
    await queryInterface.createTable('PartnerScriptCategories', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
    }, { transaction });
    await queryInterface.addColumn('Scripts', 'partnerScriptCategoryId', {
      type: Sequelize.INTEGER,
      references: { model: 'PartnerScriptCategories', key: 'id' },
    }, { transaction });
  }),
  down: (queryInterface) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.removeColumn('Accounts', 'partner', { transaction });
    await queryInterface.removeColumn('Scripts', 'public', { transaction });
    await queryInterface.removeColumn('Scripts', 'partnerScriptCategoryId', { transaction });
    await queryInterface.dropTable('PartnerScriptCategories', { transaction });
  }),
};
