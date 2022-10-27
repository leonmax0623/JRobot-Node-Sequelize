'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.addColumn('PaymentRates', 'names', {
      type: Sequelize.JSON
    }, { transaction });
    await queryInterface.addColumn('PaymentRates', 'freeDays', {
      type: Sequelize.INTEGER
    }, { transaction });
    await queryInterface.addColumn('PaymentRates', 'freeHours', {
      type: Sequelize.INTEGER
    }, { transaction });
  }),
  down: (queryInterface) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.removeColumn('PaymentRates', 'names', { transaction });
    await queryInterface.removeColumn('PaymentRates', 'freeDays', { transaction });
    await queryInterface.removeColumn('PaymentRates', 'freeHours', { transaction });
  }),
};
