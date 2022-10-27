'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.addColumn('Accounts', 'params', {
      type: Sequelize.JSON
    }, { transaction });
  }),
  down: (queryInterface) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.removeColumn('Accounts', 'params', { transaction });
  }),
};
