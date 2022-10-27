module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.addColumn('Roots', 'sendFeedbacks', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    }, { transaction });
  }),
  down: (queryInterface) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.removeColumn('Roots', 'sendFeedbacks', { transaction });
  }),
};
