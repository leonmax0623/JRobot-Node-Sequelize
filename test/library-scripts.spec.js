/* eslint-disable object-curly-newline */
const chai = require('chai');
const chaiHTTP = require('chai-http');
const chalk = require('chalk');
const sinon = require('sinon');
// const intel = require('intel');
// const jwt = require('jsonwebtoken');

chai.use(chaiHTTP);

const memory = require('../src/tools/memory');
const { truncateModels } = require('./utils');
const server = require('../src/app');
// const config = require('../config');

let request;
const { db } = memory;
const { expect } = chai;

describe('Библиотека сценариев', () => {
  before(async () => {
    await db.sequelize.sync({ force: true });
  });

  context('memory.getLibraryScripts', () => {
    let scripts;
    let accounts;
    let categories;
    let accountNames;

    before(async () => {
      [accounts, categories] = await Promise.all([
        db.Account.bulkCreate([
          { name: 'default', partner: false },
          { name: 'ivan', partner: true },
          { name: 'kesha', partner: true },
        ]),
        db.PartnerScriptCategory.bulkCreate([
          { name: 'cats' },
          { name: 'dogs' },
        ]),
      ]);

      accountNames = new Map(accounts.map(({ id, name }) => [id, name]));

      scripts = await db.Script.bulkCreate([{
        meta: { someData: 124 },
        accountId: accounts[0].id,
        public: true,
      }, {
        meta: { foo: 'bar' },
        accountId: accounts[1].id,
        public: true,
      }, {
        meta: { foo: 'bar' },
        accountId: accounts[1].id,
        public: true,
        partnerScriptCategoryId: categories[0].id,
      }, {
        meta: { foo: '121515' },
        accountId: accounts[1].id,
        public: false,
      }, {
        meta: { value: [1, 2, 3] },
        accountId: accounts[1].id,
        public: true,
        destroyedAt: new Date(),
      }, {
        meta: { foo: false },
        accountId: accounts[2].id,
        public: true,
        partnerScriptCategoryId: categories[0].id,
      }, {
        meta: { bar: true },
        accountId: accounts[2].id,
        public: true,
        partnerScriptCategoryId: categories[1].id,
      }, {
        meta: null,
        accountId: accounts[2].id,
        public: false,
        partnerScriptCategoryId: categories[1].id,
      }, {
        meta: { value: [1, 8, 3] },
        accountId: accounts[2].id,
        public: true,
        destroyedAt: new Date(),
        partnerScriptCategoryId: categories[0].id,
      }]);
    });

    it('Работает без categoryId', async () => {
      const expectedMembers = scripts
        .filter((scr) => (
          scr.public
          && !scr.destroyedAt
          && [accounts[1].id, accounts[2].id].includes(scr.accountId)
        ))
        .map(({ id, meta, partnerScriptCategoryId, accountId }) => ({
          id,
          meta,
          partnerScriptCategoryId,
          partnerName: accountNames.get(accountId),
        }));

      const result = await memory.getLibraryScripts();

      expect(result).to.be.an('array');
      expect(result).to.not.be.empty;
      expect(result).to.have.deep.members(expectedMembers);
    });

    it('Работает categoryId', async () => {
      const categoryId = categories[0].id;
      const expectedMembers = scripts
        .filter((scr) => (
          scr.public
          && !scr.destroyedAt
          && [accounts[1].id, accounts[2].id].includes(scr.accountId)
          && scr.partnerScriptCategoryId === categoryId
        ))
        .map(({ id, meta, partnerScriptCategoryId, accountId }) => ({
          id,
          meta,
          partnerScriptCategoryId,
          partnerName: accountNames.get(accountId),
        }));

      const result = await memory.getLibraryScripts({ categoryId });

      expect(result).to.be.an('array');
      expect(result).to.not.be.empty;
      expect(result).to.have.deep.members(expectedMembers);
    });
  });

  context('Роуты', () => {
    let account;
    let admin;
    let manager;
    let student;
    let partner;
    let partnerUser;
    let anotherAccount;
    // let accountScripts;
    // let p

    let adminToken;
    let managerToken;
    let studentToken;
    let partnerUserToken;

    before(async () => {
      request = chai.request(server.listen(7001)).keepOpen();

      await truncateModels('Account', 'User', 'Script', 'AccountPartnerScript');

      [account, partner, anotherAccount] = await db.Account.bulkCreate([
        { name: 'default' },
        { name: 'partner-name-yeah', partner: true },
        { name: 'another' },
      ]);

      [admin, manager, student, partnerUser] = await Promise.all([
        memory.create.user({
          role: 'admin',
          username: 'admin',
          password: 'pass',
          accountId: account.id,
        }),
        memory.create.user({
          role: 'manager',
          username: 'manager',
          password: 'pass',
          accountId: account.id,
        }),
        memory.create.user({
          role: 'student',
          username: 'student',
          password: 'pass',
          accountId: account.id,
        }),
        memory.create.user({
          role: 'admin',
          username: 'partner-user',
          password: 'pass',
          accountId: partner.id,
        }),
      ]);

      [adminToken, managerToken, studentToken, partnerUserToken] = await Promise.all([
        memory.setSignJwt(admin),
        memory.setSignJwt(manager),
        memory.setSignJwt(student),
        memory.setSignJwt(partnerUser),
      ]);
    });

    after(async () => {
      request.close();
    });

    afterEach(async () => {
      sinon.restore();
    });

    context(chalk.magenta('GET /library-scripts'), () => {
      function testRequest(token, query = null, callback) {
        request.get('/library-scripts')
          .set('Authorization', `JWT ${token}`)
          .query(query)
          .end(callback);
      }

      it('Админ просто запрашивает', (done) => {
        const response = [{ some: true }, 1, 5, false];
        const memoryStub = sinon.stub(memory, 'getLibraryScripts').resolves(response);

        testRequest(adminToken, null, (err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(200);
          expect(res.body).to.deep.equal(response);
          expect(memoryStub.calledOnceWithExactly({})).to.be.true;
          done();
        });
      });

      it('Админ указывает categoryId', (done) => {
        const categoryId = 1234321;
        const response = [9, 7, 1, 2];
        const memoryStub = sinon.stub(memory, 'getLibraryScripts').resolves(response);

        testRequest(adminToken, { categoryId }, (err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(200);
          expect(res.body).to.deep.equal(response);
          expect(memoryStub.calledOnceWithExactly({ categoryId })).to.be.true;
          done();
        });
      });
    });

    context(chalk.magenta('GET /partner-subscriptions'), () => {
      it('Админ просто запрашивает', async () => {
        const scripts = await db.Script.bulkCreate([{}, {}, {}]);
        await account.addPartnerScripts(scripts);

        await new Promise((resolve) => {
          request.get('/partner-subscriptions')
            .set('Authorization', `JWT ${adminToken}`)
            .end((err, res) => {
              expect(err).to.not.exist;
              expect(res).to.have.status(200);
              const { body } = res;
              expect(body).to.be.an('array');
              expect(body).to.have.members(scripts.map(({ id }) => id));
              resolve();
            });
        });
      });
    });

    context(chalk.magenta('POST /subscribe-to-partner-script'), () => {
      beforeEach(async () => {
        await truncateModels('AccountPartnerScript');
      });

      it('Админ подписывается на то, на что не подписан', async () => {
        const script = await db.Script.create({
          meta: 'test',
          public: true,
          accountId: partner.id,
        });

        await new Promise((resolve) => {
          request.post('/subscribe-to-partner-script')
            .set('Authorization', `JWT ${adminToken}`)
            .query({ id: script.id })
            .end((err, res) => {
              expect(err).to.not.exist;
              expect(res).to.have.status(204);
              resolve();
            });
        });

        const partnerScripts = await account.getPartnerScripts();
        expect(partnerScripts).to.have.length(1);
        expect(partnerScripts[0].id).to.equal(script.id);
      });

      it('Админ подписывается на то, на что подписан', async () => {
        const script = await db.Script.create({
          meta: 'test',
          public: true,
          accountId: partner.id,
        });
        await account.addPartnerScript(script.id);

        await new Promise((resolve) => {
          request.post('/subscribe-to-partner-script')
            .set('Authorization', `JWT ${adminToken}`)
            .query({ id: script.id })
            .end((err, res) => {
              expect(err).to.not.exist;
              expect(res).to.have.status(204);
              resolve();
            });
        });

        const partnerScripts = await account.getPartnerScripts();
        expect(partnerScripts).to.have.length(1);
        expect(partnerScripts[0].id).to.equal(script.id);
      });

      it('Админ пытается подписаться на сценарий, который не в партнёрском аккаунте', async () => {
        const script = await db.Script.create({
          meta: 'test',
          public: true,
          accountId: anotherAccount.id,
        });

        await new Promise((resolve) => {
          request.post('/subscribe-to-partner-script')
            .set('Authorization', `JWT ${adminToken}`)
            .query({ id: script.id })
            .end((err, res) => {
              expect(err).to.not.exist;
              expect(res).to.have.status(404);
              expect(res.text).to.equal('script_not_found');
              resolve();
            });
        });
      });

      it('Админ пытается подписаться на сценарий, который не публичен', async () => {
        const script = await db.Script.create({
          meta: 'test',
          public: false,
          accountId: partner.id,
        });

        await new Promise((resolve) => {
          request.post('/subscribe-to-partner-script')
            .set('Authorization', `JWT ${adminToken}`)
            .query({ id: script.id })
            .end((err, res) => {
              expect(err).to.not.exist;
              expect(res).to.have.status(404);
              expect(res.text).to.equal('script_not_found');
              resolve();
            });
        });
      });

      it('Админ пытается подписаться на сценарий, который в архиве', async () => {
        const script = await db.Script.create({
          meta: 'test',
          public: true,
          accountId: partner.id,
          destroyedAt: new Date(),
        });

        await new Promise((resolve) => {
          request.post('/subscribe-to-partner-script')
            .set('Authorization', `JWT ${adminToken}`)
            .query({ id: script.id })
            .end((err, res) => {
              expect(err).to.not.exist;
              expect(res).to.have.status(404);
              expect(res.text).to.equal('script_not_found');
              resolve();
            });
        });
      });

      it('Админ пытается подписаться на сценарий, которого нет', (done) => {
        request.post('/subscribe-to-partner-script')
          .set('Authorization', `JWT ${adminToken}`)
          .query({ id: 141235123512351 })
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(404);
            expect(res.text).to.equal('script_not_found');
            done();
          });
      });
    });

    context(chalk.magenta('POST /unsubscribe-from-partner-script'), () => {
      it('Админ отписывается от того, на что подписан', async () => {
        const script = await db.Script.create({});
        await account.addPartnerScript(script.id);

        await new Promise((resolve) => {
          request.post('/unsubscribe-from-partner-script')
            .set('Authorization', `JWT ${adminToken}`)
            .query({ id: script.id })
            .end((err, res) => {
              expect(err).to.not.exist;
              expect(res).to.have.status(204);
              resolve();
            });
        });

        const partnerScripts = await account.getPartnerScripts();
        expect(partnerScripts).to.be.empty;
      });

      it('Админ отписывается от того, на что подписан, даже если сценарий в архиве', async () => {
        const script = await db.Script.create({
          destroyedAt: new Date(),
        });
        await account.addPartnerScript(script.id);

        await new Promise((resolve) => {
          request.post('/unsubscribe-from-partner-script')
            .set('Authorization', `JWT ${adminToken}`)
            .query({ id: script.id })
            .end((err, res) => {
              expect(err).to.not.exist;
              expect(res).to.have.status(204);
              resolve();
            });
        });

        const partnerScripts = await account.getPartnerScripts();
        expect(partnerScripts).to.be.empty;
      });

      it('Админ отписывается от того, на что не подписан', async () => {
        const script = await db.Script.create({});
        // await account.addPartnerScript(script.id);

        await new Promise((resolve) => {
          request.post('/unsubscribe-from-partner-script')
            .set('Authorization', `JWT ${adminToken}`)
            .query({ id: script.id })
            .end((err, res) => {
              expect(err).to.not.exist;
              expect(res).to.have.status(204);
              resolve();
            });
        });

        const partnerScripts = await account.getPartnerScripts();
        expect(partnerScripts).to.be.empty;
      });
    });

    context('Запрещено для менеджера, студента и партнёра', () => {
      [
        ['get', '/library-scripts'],
        ['get', '/partner-subscriptions'],
        ['post', '/subscribe-to-partner-script'],
        ['post', '/unsubscribe-from-partner-script'],
      ].forEach(([method, path]) => {
        // Конкретный роут
        context(chalk.magenta(`${method.toUpperCase()} ${path}`), () => {
          ['Менеджер', 'Студент', 'Партнёр'].forEach((user, index) => {
            // Тест
            it(`${user} -> 403`, (done) => {
              const token = [managerToken, studentToken, partnerUserToken][index];
              request[method](path)
                .set('Authorization', `JWT ${token}`)
                .end((err, res) => {
                  expect(err).to.not.exist;
                  expect(res).to.have.status(403);
                  done();
                });
            });
          });
        });
      });
    });
  });
});
