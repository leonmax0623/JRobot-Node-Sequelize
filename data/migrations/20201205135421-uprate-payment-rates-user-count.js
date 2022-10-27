'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.addColumn('PaymentRates', 'userCount', {
      type: Sequelize.JSON
    }, { transaction });
    await queryInterface.addColumn('PaymentRates', 'hourCount', {
      type: Sequelize.JSON
    }, { transaction });
  }),
  down: (queryInterface) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.removeColumn('PaymentRates', 'userCount', { transaction });
    await queryInterface.removeColumn('PaymentRates', 'hourCount', { transaction });
  }),
};
