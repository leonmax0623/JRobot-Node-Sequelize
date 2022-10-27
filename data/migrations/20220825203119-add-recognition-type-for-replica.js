'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.addColumn('Replicas', 'recognitionType', {
      type: Sequelize.TEXT,
      allowNull: true,
    }, { transaction });
  }),
  down: (queryInterface) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.removeColumn('Replicas', 'recognitionType', { transaction });
  }),
};
