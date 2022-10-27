module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async (transaction) => {
    // await queryInterface.addColumn('Sessions', 'hiddenWordsValue', {
    //   type: Sequelize.REAL,
    //   defaultValue: null,
    // }, { transaction });
    await queryInterface.addColumn('Sessions', 'trueHiddenWordsValue', {
      type: Sequelize.REAL,
      defaultValue: null,
    }, { transaction });
  }),
  down: (queryInterface) => queryInterface.sequelize.transaction(async (transaction) => {
    // await queryInterface.removeColumn('Sessions', 'hiddenWordsValue', { transaction });
    await queryInterface.removeColumn('Sessions', 'trueHiddenWordsValue', { transaction });
  }),
};
