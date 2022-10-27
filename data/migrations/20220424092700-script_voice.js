'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.createTable('ScriptVoices', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      scriptId: {
        type: Sequelize.INTEGER,
        references: {
          model: {
            tableName: 'Scripts',
          },
          key: 'id'
        },
        allowNull: false,
      },
      voiceId: {
        type: Sequelize.INTEGER,
        references: {
          model: {
            tableName: 'Voices',
          },
          key: 'id'
        },
        allowNull: false,
      },
      replicaId: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      filePath: {
        type: Sequelize.STRING,
        allowNull: false,
      },
    }, { transaction });

    await queryInterface.addIndex(
        'ScriptVoices',
        ['replicaId'],
        { transaction }
    );
  }),
  down: (queryInterface) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.dropTable('ScriptVoices', { transaction });
  }),
};
