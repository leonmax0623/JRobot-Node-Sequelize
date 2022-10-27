module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.addColumn('Accounts', 'becomedLiveAt', {
      type: Sequelize.DATE,
      defaultValue: null,
    }, { transaction });

    await queryInterface.sequelize.query(`
      update "Accounts" set "becomedLiveAt" = '2020-03-1' where status = 'live'
    `, { transaction });
  }),
  down: (queryInterface) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.removeColumn('Accounts', 'becomedLiveAt', { transaction });
  }),
};
