const chai = require('chai');
const chaiHTTP = require('chai-http');
const chalk = require('chalk');

chai.use(chaiHTTP);

const memory = require('../src/tools/memory');
const server = require('../src/app');
const { truncateModels } = require('./utils');

const { expect } = chai;
const { db } = memory;

let request;

async function getToken(username) {
  const user = await db.User.findOne({ where: { username } });
  const token = await memory.setSignJwt(user);
  return token;
}

describe(chalk.magenta('/script-groups'), () => {
  let accounts;
  let scripts;
  let groups;
  let userToken;
  let partnerToken;

  before(async () => {
    request = chai.request(server.listen(7001)).keepOpen();
    await db.sequelize.sync({ force: true });

    accounts = await db.Account.bulkCreate([
      { name: '1' },
      { name: '2' },
      { name: '3', partner: true },
    ]);


    [scripts, groups] = await Promise.all([
      db.Script.bulkCreate([
        { accountId: accounts[0].id },
        { accountId: accounts[0].id },
        { accountId: accounts[1].id }, // обычного чужого аккаунта
        { accountId: accounts[2].id }, // партнёрский
      ]),
      db.Group.bulkCreate([
        { name: '1', accountId: accounts[0].id },
        { name: '2', accountId: accounts[1].id },
      ]),
      memory.create.user({
        role: 'admin',
        username: 'test',
        password: 'pass',
        accountId: accounts[0].id,
      }),
      memory.create.user({
        role: 'admin',
        username: 'partner',
        password: 'pass',
        accountId: accounts[2].id,
      }),
    ]);

    [userToken, partnerToken] = await Promise.all([
      getToken('test'),
      getToken('partner'),
    ]);

    await Promise.all([
      groups[0].addScript(scripts[1].id),
      groups[0].addScript(scripts[3].id),
      groups[1].addScript(scripts[2].id),
      groups[1].addScript(scripts[3].id),
    ]);
  });

  after(async () => {
    request.close();
  });

  context('GET', () => {
    it('Свой сценарий, нет групп', (done) => {
      request.get('/script-groups')
        .query({ id: scripts[0].id })
        .set('Authorization', `JWT ${userToken}`)
        .end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(200);
          expect(res.body).to.be.an('array');
          expect(res.body).to.be.empty;
          done();
        });
    });
    it('Свой сценарий, свои группы', (done) => {
      request.get('/script-groups')
        .query({ id: scripts[1].id })
        .set('Authorization', `JWT ${userToken}`)
        .end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(200);
          expect(res.body).to.be.an('array');
          expect(res.body).to.deep.equal([groups[0].id]);
          done();
        });
    });
    it('Не свой сценарий', (done) => {
      request.get('/script-groups')
        .query({ id: scripts[2].id })
        .set('Authorization', `JWT ${userToken}`)
        .end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(200);
          expect(res.body).to.be.an('array');
          expect(res.body).to.be.empty;
          done();
        });
    });
    it('Партнёрский сценарий', (done) => {
      request.get('/script-groups')
        .query({ id: scripts[3].id })
        .set('Authorization', `JWT ${userToken}`)
        .end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(200);
          expect(res.body).to.be.an('array');
          expect(res.body).to.deep.equal([groups[0].id]);
          done();
        });
    });
    it('Партнёр смотрит группы своего сценария (403)', (done) => {
      request.get('/script-groups')
        .query({ id: scripts[3].id })
        .set('Authorization', `JWT ${partnerToken}`)
        .end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(403);
          done();
        });
    });
    it('Нет id в query', (done) => {
      request.get('/script-groups')
        .set('Authorization', `JWT ${userToken}`)
        .end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(400);
          done();
        });
    });
    it('id не число', (done) => {
      request.get('/script-groups')
        .query({ id: 'invalid id' })
        .set('Authorization', `JWT ${userToken}`)
        .end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(400);
          done();
        });
    });
  });

  context('PATCH', () => {
    beforeEach(async () => {
      await truncateModels('GroupScript');
    });

    it('Некоторые группы чужие', async () => {
      await new Promise((resolve) => {
        request.patch('/script-groups')
          .set('Authorization', `JWT ${userToken}`)
          .send([groups[0].id, groups[1].id])
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(403);
            expect(res.text).to.equal('Some groups not allowed');
            resolve();
          });
      });
    });

    it('Тело не массив', async () => {
      await new Promise((resolve) => {
        request.patch('/script-groups')
          .set('Authorization', `JWT ${userToken}`)
          .send({ what: 'a' })
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(400);
            expect(res.text).to.equal('Invalid body (must be an array of ids)');
            resolve();
          });
      });
    });

    it('Плохой id в запросе', async () => {
      await new Promise((resolve) => {
        request.patch('/script-groups')
          .set('Authorization', `JWT ${userToken}`)
          .query({ id: 'hahaha' })
          .send([groups[0].id])
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(400);
            expect(res.text).to.equal('Invalid id');
            resolve();
          });
      });
    });

    it('Установка групп своим сценариям', async () => {
      const newGroups = await db.Group.bulkCreate([
        { name: '1252', accountId: accounts[0].id },
        { name: '16235', accountId: accounts[0].id },
      ]);
      const scriptId = scripts[0].id;

      await new Promise((resolve) => {
        request.patch('/script-groups')
          .set('Authorization', `JWT ${userToken}`)
          .query({ id: scriptId })
          .send(newGroups.map(({ id }) => id))
          .end((err, res) => {
            expect(err).to.not.exist;
            // console.log(res.text)
            expect(res).to.have.status(204);
            resolve();
          });
      });

      const data = await db.sequelize.query(`
        select "groupId", "scriptId"
        from "GroupScript"
      `, { type: db.Sequelize.QueryTypes.SELECT });
      expect(data).to.deep.equal(newGroups.map(
        ({ id: groupId }) => ({ groupId, scriptId }),
      ));
    });

    it('Установка групп сценарию партнёра (не портит чужие установки)', async () => {
      const newGroups = await db.Group.bulkCreate([
        { name: 'aaaaa', accountId: accounts[0].id },
        { name: 'bbbbb', accountId: accounts[0].id },
        { name: 'ccccc', accountId: accounts[0].id },
        { name: 'ddddd', accountId: accounts[1].id },
      ]);
      await scripts[3].setGroups([newGroups[0].id, newGroups[3].id]);
      const scriptId = scripts[3].id;

      await new Promise((resolve) => {
        request.patch('/script-groups')
          .set('Authorization', `JWT ${userToken}`)
          .query({ id: scriptId })
          .send([newGroups[1].id, newGroups[2].id])
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(204);
            resolve();
          });
      });

      const data = await db.sequelize.query(`
        select "groupId", "scriptId"
        from "GroupScript"
      `, { type: db.Sequelize.QueryTypes.SELECT });
      const expectedItems = newGroups.slice(1, 4).map(
        ({ id: groupId }) => ({ groupId, scriptId }),
      );
      expect(data).to.have.length(expectedItems.length);
      expectedItems.forEach((item) => expect(data).to.deep.include(item));
    });

    it('Установка групп сценарию другого аккаунта, обычного (404 Script not found)', async () => {
      await new Promise((resolve) => {
        request.patch('/script-groups')
          .set('Authorization', `JWT ${userToken}`)
          .query({ id: scripts[2].id })
          .send([groups[0].id])
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(404);
            expect(res.text).to.eql('Script not found');
            resolve();
          });
      });
    });

    it('Удаление всех групп своему сценарию (отправка пустого массива)', async () => {
      const newGroups = await db.Group.bulkCreate([
        { name: 'clean-1', accountId: accounts[0].id },
        { name: 'clean-2', accountId: accounts[0].id },
      ]);
      await scripts[0].setGroups(newGroups.map(({ id }) => id));

      await new Promise((resolve) => {
        request.patch('/script-groups')
          .set('Authorization', `JWT ${userToken}`)
          .query({ id: scripts[0].id })
          .send([])
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(204);
            resolve();
          });
      });

      const data = await db.sequelize.query(`
        select *
        from "GroupScript"
      `, { type: db.Sequelize.QueryTypes.SELECT });
      expect(data).to.be.empty;
    });

    it('Удаление всех групп сценарию партнёра (отправка пустого массива)', async () => {
      const newGroups = await db.Group.bulkCreate([
        { name: 'clean-1', accountId: accounts[0].id },
        { name: 'clean-2', accountId: accounts[0].id },
      ]);
      await scripts[3].setGroups(newGroups.map(({ id }) => id));

      await new Promise((resolve) => {
        request.patch('/script-groups')
          .set('Authorization', `JWT ${userToken}`)
          .query({ id: scripts[3].id })
          .send([])
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(204);
            resolve();
          });
      });

      const data = await db.sequelize.query(`
        select *
        from "GroupScript"
      `, { type: db.Sequelize.QueryTypes.SELECT });
      expect(data).to.be.empty;
    });
  });
});
