/* eslint-disable object-curly-newline */
const chai = require('chai');
const chaiHTTP = require('chai-http');
const chalk = require('chalk');

chai.use(chaiHTTP);

const memory = require('../src/tools/memory');
const { truncateModels } = require('./utils');
const server = require('../src/app');

let request;
const { db } = memory;
const { expect } = chai;

describe('Порядок сценариев', () => {
  let account;
  let user;
  let account2;
  let scripts;
  let scripts2;
  let token;

  before(async () => {
    await db.sequelize.sync({ force: true });
    request = chai.request(server.listen(7000)).keepOpen();

    [account, account2] = await db.Account.bulkCreate([
      { name: 'test' },
      { name: 'another' },
    ]);

    [user, scripts, scripts2] = await Promise.all([
      memory.create.user({
        username: 'test',
        password: 'test',
        role: 'admin',
        accountId: account.id,
      }),
      db.Script.bulkCreate(new Array(5).fill(0).map(() => ({ accountId: account.id }))),
      db.Script.bulkCreate(new Array(3).fill(0).map(() => ({ accountId: account2.id }))),
    ]);

    [token] = await Promise.all([
      memory.setSignJwt(user),
    ]);
  });

  after(async () => {
    request.close();
  });

  context(chalk.magenta('GET /scripts'), () => {
    /** @returns {Promise<number[]>} */
    function getScripts() {
      return new Promise((resolve) => {
        request.get('/scripts')
          .set('Authorization', `JWT ${token}`)
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(200);
            expect(res.body).to.be.an('array');
            resolve(res.body.map(({ id }) => id));
          });
      });
    }

    beforeEach(async () => {
      await truncateModels('AccountScriptOrder');
    });

    it('В базе нет данных сортировки', async () => {
      const result = await getScripts();

      expect(result).to.have.ordered.members(scripts.map(({ id }) => id));
    });

    it('В базе есть данные сортировки', async () => {
      const order = [0, 4, 2, 3, 1];
      await db.AccountScriptOrder.bulkCreate(order.map((index) => ({
        accountId: account.id,
        scriptId: scripts[index].id,
      })));

      const result = await getScripts();

      expect(result).to.have.ordered.members(order.map((index) => scripts[index].id));
    });

    it('В базе есть данные сортировки и другого аккаунта', async () => {
      const order = [0, 2, 1, 3, 4];
      await db.AccountScriptOrder.bulkCreate(order.map((index) => ({
        accountId: account.id,
        scriptId: scripts[index].id,
      })));
      await db.AccountScriptOrder.bulkCreate([2, 1, 0].map((index) => ({
        accountId: account2.id,
        scriptId: scripts2[index].id,
      })));

      const result = await getScripts();

      expect(result).to.have.ordered.members(order.map((index) => scripts[index].id));
    });

    it('В базе есть данные сортировки, но не на все сценарии', async () => {
      // const order = [4, 3];
      await db.AccountScriptOrder.bulkCreate([4, 3].map((index) => ({
        accountId: account.id,
        scriptId: scripts[index].id,
      })));

      const result = await getScripts();

      expect(result).to.have.ordered.members([4, 3, 0, 1, 2].map((index) => scripts[index].id));
    });
  });

  context(chalk.magenta('POST /set-scripts-order'), () => {
    function setScriptsOrder(values) {
      return new Promise((resolve) => {
        request.post('/set-scripts-order')
          .set('Authorization', `JWT ${token}`)
          .send(values)
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(204);
            resolve();
          });
      });
    }

    beforeEach(async () => {
      await truncateModels('AccountScriptOrder');
    });

    it('Данных не было, а теперь есть', async () => {
      const order = [4, 0, 3];

      await setScriptsOrder(order.map((val) => scripts[val].id));

      const data = await db.AccountScriptOrder.findAll();
      expect(data.map(({ dataValues }) => dataValues)).to.deep.equal(order.map((index) => ({
        accountId: account.id,
        scriptId: scripts[index].id,
      })));
    });

    it('Данные были, но теперь только новые', async () => {
      const oldOrder = [0, 4, 3, 1, 2];
      await db.AccountScriptOrder.bulkCreate(oldOrder.map((index) => ({
        accountId: account.id,
        scriptId: scripts[index].id,
      })));
      const order = [4, 0, 3];

      await setScriptsOrder(order.map((val) => scripts[val].id));

      const data = await db.AccountScriptOrder.findAll();
      expect(data.map(({ dataValues }) => dataValues)).to.deep.equal(order.map((index) => ({
        accountId: account.id,
        scriptId: scripts[index].id,
      })));
    });

    it('Есть ещё и данные другого аккаунта, и они остались нетронутыми', async () => {
      const anotherOrder = [2, 0, 1];
      await db.AccountScriptOrder.bulkCreate([4, 1, 2].map((index) => ({
        accountId: account.id,
        scriptId: scripts[index].id,
      })));
      await db.AccountScriptOrder.bulkCreate(anotherOrder.map((index) => ({
        accountId: account2.id,
        scriptId: scripts2[index].id,
      })));
      const order = [4, 0, 3];

      await setScriptsOrder(order.map((val) => scripts[val].id));

      const data = await db.AccountScriptOrder.findAll();
      const expectedValues = [
        ...anotherOrder.map((index) => ({
          accountId: account2.id,
          scriptId: scripts2[index].id,
        })),
        ...order.map((index) => ({
          accountId: account.id,
          scriptId: scripts[index].id,
        })),
      ];
      expect(data.map(({ dataValues }) => dataValues)).to.deep.equal(expectedValues);
    });
  });
});
