const chai = require('chai');
const chaiHTTP = require('chai-http');
const timekeeper = require('timekeeper');

chai.use(chaiHTTP);

const memory = require('../src/tools/memory');
const server = require('../src/app');
const monitoringEvents = require('../src/tools/monitoring-events');

const { expect } = chai;
const { db } = memory;
/** @type {ChaiHttp.Agent} */
let request;

describe('Мониторинговые события', () => {
  before(async () => {
    request = chai.request(server.listen(7000)).keepOpen();
    await db.sequelize.sync({ force: true });
  });

  after(async () => {
    request.close();
    // await db.sequelize.close();
  });

  context('Создаются', () => {
    let account;
    let admin;

    before(async () => {
      account = await db.Account.create({ name: 'test' });
      admin = await memory.create.user({
        username: 'admin',
        password: 'admin',
        accountId: account.id,
      });
    });

    afterEach(async () => {
      await db.MonitoringEvent.destroy({ truncate: true });
      timekeeper.reset();
    });

    it('При создании пользователя', async () => {
      const token = await memory.setSignJwt(admin);
      const creationTime = Date.now();
      timekeeper.freeze(creationTime);

      const createdUserId = await new Promise((resolve) => {
        request.put('/users')
          .set('Authorization', `JWT ${token}`)
          .send({ username: 'new-user', password: 'new-user-pass', role: 'student' })
          .end((err, res) => {
            expect(err).to.not.exist;
            // console.log(res);
            expect(res).to.have.status(201);
            expect(res.body).to.have.all.keys('id');
            resolve(res.body.id);
          });
      });

      const events = await db.MonitoringEvent.findAll();
      expect(events.length).to.equal(1);
      const [event] = events;
      expect(new Date(event.createdAt).getTime()).to.equal(creationTime);
      expect(event.dataValues).to.deep.include({
        type: monitoringEvents.types.USER_CREATED,
        extra: {
          accountId: account.id,
          userId: admin.id,
          createdUserId,
        },
      });
    });
    it('При создании сценария', async () => {
      const token = await memory.setSignJwt(admin);
      const creationTime = Date.now();
      timekeeper.freeze(creationTime);

      const createdScriptId = await new Promise((resolve) => {
        request.put('/scripts')
          .set('Authorization', `JWT ${token}`)
          .send({ meta: { field: true } })
          .end((err, res) => {
            expect(err).to.not.exist;
            // console.log(res);
            expect(res).to.have.status(201);
            expect(res.body).to.have.all.keys('id');
            resolve(res.body.id);
          });
      });

      const events = await db.MonitoringEvent.findAll();
      expect(events.length).to.equal(1);
      const [event] = events;
      expect(new Date(event.createdAt).getTime()).to.equal(creationTime);
      expect(event.dataValues).to.deep.include({
        type: monitoringEvents.types.SCRIPT_PATCHED,
        extra: {
          accountId: account.id,
          userId: admin.id,
          scriptId: createdScriptId,
          create: true,
        },
      });
    });
    it('При редактировании сценария', async () => {
      const token = await memory.setSignJwt(admin);
      const script = await db.Script.create({
        accountId: account.id,
      });
      const creationTime = Date.now();
      timekeeper.freeze(creationTime);

      await new Promise((resolve) => {
        request.patch('/scripts')
          .query({ id: script.id })
          .set('Authorization', `JWT ${token}`)
          .send({ meta: { field: true } })
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(204);
            resolve();
          });
      });

      const events = await db.MonitoringEvent.findAll();
      expect(events.length).to.equal(1);
      const [event] = events;
      expect(new Date(event.createdAt).getTime()).to.equal(creationTime);
      expect(event.dataValues).to.deep.include({
        type: monitoringEvents.types.SCRIPT_PATCHED,
        extra: {
          accountId: account.id,
          userId: admin.id,
          scriptId: script.id,
          create: false,
        },
      });
    });
    it('При регистрации аккаунта', async () => {
      const USERNAME = 'another-new-user';
      await db.Account.create({ name: 'template' });
      const creationTime = Date.now();
      timekeeper.freeze(creationTime);

      await new Promise((resolve) => {
        request.post('/register')
          .send({ username: USERNAME })
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(201);
            resolve();
          });
      });

      const [events, newUser] = await Promise.all([
        db.MonitoringEvent.findAll(),
        db.User.findOne({ where: { username: USERNAME } }),
      ]);
      expect(events.length).to.equal(1);
      expect(newUser).to.exist;
      const [event] = events;
      expect(new Date(event.createdAt).getTime()).to.equal(creationTime);
      expect(event.dataValues).to.deep.include({
        type: monitoringEvents.types.ACCOUNT_REGISTERED,
        extra: {
          accountId: newUser.accountId,
        },
      });
    });
  });
});
