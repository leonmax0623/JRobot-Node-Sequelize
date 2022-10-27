'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.addColumn('Scripts', 'archivedAt', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    }, { transaction });
  }),
  down: (queryInterface) => queryInterface.sequelize.transaction(async (transaction) => {
    //await queryInterface.removeColumn('Scripts', 'archivedAt', { transaction });
  }),
};
