module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.sequelize.query(`
      create table "AccountScriptOrders" (
        "accountId" integer references "Accounts" (id) ON DELETE CASCADE ON UPDATE CASCADE,
        "scriptId" integer references "Scripts" (id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `, { transaction });

    const existed = await queryInterface.sequelize.query(`
      select "Accounts".id "accountId", "Scripts".id "scriptId"
      from "Scripts" join "Accounts" on "Accounts".id = "Scripts"."accountId"
      where "Scripts"."orderNum" is not null
      order by "Accounts".id, "Scripts"."orderNum"
    `, { type: Sequelize.QueryTypes.SELECT, transaction });
    const values = existed.map(({ accountId, scriptId }) => `(${accountId}, ${scriptId})`);
    await queryInterface.sequelize.query(
      `insert into "AccountScriptOrders" ("accountId", "scriptId") values ${values.join(', ')}`,
      { transaction },
    );

    await queryInterface.removeColumn('Scripts', 'orderNum', { transaction });
  }),
  down: (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.addColumn('Scripts', 'orderNum', {
      type: Sequelize.INTEGER,
    }, { transaction });

    const existed = await queryInterface.sequelize.query(`
      select "accountId", "scriptId"
      from "AccountScriptOrders"
    `, { type: Sequelize.QueryTypes.SELECT, transaction });
    /** @type {Map<number, number>} */
    const currentForAccounts = new Map();
    const orders = new Map();
    existed.forEach(({ accountId, scriptId }) => {
      if (currentForAccounts.has(accountId)) {
        const current = currentForAccounts.get(accountId);
        orders.set(scriptId, current + 1);
        currentForAccounts.set(accountId, current + 1);
      } else {
        orders.set(scriptId, 0);
        currentForAccounts.set(accountId, 0);
      }
    });

    await Promise.all([...orders].map(([scriptId, orderNum]) => (
      queryInterface.sequelize.query(
        `update "Scripts" set "orderNum" = ${orderNum} where id = ${scriptId}`,
        { transaction },
      )
    )));

    await queryInterface.dropTable('AccountScriptOrders', { transaction });
  }),
};
