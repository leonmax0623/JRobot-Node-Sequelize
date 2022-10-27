const chai = require('chai');
const chaiHTTP = require('chai-http');
const sinon = require('sinon');

chai.use(chaiHTTP);

const memory = require('../src/tools/memory');
const server = require('../src/app');
const random = require('../src/tools/random');
const amoHooks = require('../src/amoCRM/hooks');
const entryLink = require('../src/tools/entry-link');
const mailer = require('../src/tools/mailer');
const entries = require('../src/tools/entries');
const { truncateModels } = require('./utils');

const { expect } = chai;
const { db } = memory;
/** @type {ChaiHttp.Agent} */
let request;

describe('Тестирование публичных маршрутов приложения', () => {
  before(async () => {
    request = chai.request(server.listen(7000)).keepOpen();
    await db.sequelize.sync({ force: true });
  });

  after(async () => {
    request.close();
    // await db.sequelize.close();
  });

  afterEach(async () => {
    sinon.restore();
    await truncateModels('Account', 'User', 'Entry');
    // await Promise.all([
    //   db.Account.destroy({ truncate: true }),
    //   db.User.destroy({ truncate: true }),
    //   db.Entry.destroy({ truncate: true }),
    // ]);
  });

  context('POST /register', () => {
    it('400 invalid_username, если не предоставлен username', (done) => {
      request.post('/register')
        .send({ password: 'some_pass' })
        .end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(400);
          expect(res.text).to.equal('invalid_username');
          done();
        });
    });
    it('400 username_already_exists, если пользователь уже есть', async () => {
      const user = await memory.create.user({ username: 'test', password: 'test' });

      await new Promise((resolve) => {
        request.post('/register')
          .send({ username: user.username })
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(400);
            expect(res.text).to.equal('username_already_exists');
            resolve();
          });
      });
    });
    it('400 account_already_exists, если уже есть аккаунт для этого username', async () => {
      await db.Account.create({ name: 'template' });
      const username = 'test';

      await new Promise((resolve) => {
        request.post('/register')
          .send({ username })
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(201);
            resolve();
          });
      });

      await db.User.destroy({ where: { username } });

      await new Promise((resolve) => {
        request.post('/register')
          .send({ username })
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(400);
            expect(res.text).to.equal('account_already_exists');
            resolve();
          });
      });
    });
    it('Создаётся пользователь со случайным паролем', (done) => {
      const UTM = 'asdf_1235-asdfa==+4123';
      const PHONE = '+7 1251 234 2 1 5';
      const PROMO = 'some value';

      const RANDOM_PASS = '%!%@#4242342305050AAAAaaaa';
      const passwordStub = sinon.stub(random, 'password');
      passwordStub.resolves(RANDOM_PASS);

      const CREATING_USER = { id: 5123, username: 'test-username' };
      const createUserStub = sinon.stub(memory.create, 'user');
      createUserStub.resolves(CREATING_USER);

      const CREATING_ACCOUNT = { id: 981 };
      const createTempAccount = sinon.stub(memory.create, 'accountFromTemplate');
      createTempAccount.resolves(CREATING_ACCOUNT);

      const hookStub = sinon.stub(amoHooks, 'accountCreated');
      const linkStub = sinon.stub(entryLink, 'makeEntryLink');
      linkStub.resolves('test link');

      request.post('/register')
        .send({
          username: CREATING_USER.username,
          utm_term: UTM,
          phone: PHONE,
          promo: PROMO,
        })
        .query({ en: 0 })
        .end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(201);
          expect(passwordStub.calledOnce).to.be.true;
          expect(passwordStub.firstCall.args[0]).to.be.greaterThan(6);
          expect(createTempAccount.calledOnce).to.be.true;
          expect(createUserStub.calledOnce).to.be.true;
          expect(createUserStub.getCall(0).args[0]).to.include({
            role: 'admin',
            password: RANDOM_PASS,
            username: CREATING_USER.username,
            accountId: CREATING_ACCOUNT.id,
          });
          expect(hookStub.calledOnce).to.be.true;
          expect(hookStub.firstCall.args).to.deep.equal([CREATING_ACCOUNT, CREATING_USER, {
            password: RANDOM_PASS,
            utm_term: UTM,
            email: CREATING_USER.username,
            phone: PHONE,
            promo: PROMO,
            requestPresentation: false,
            utm_campaign: undefined,
          }]);
          done();
        });
    });
    it('Создаётся пользователь с паролем из тела запроса', (done) => {
      const UTM = 'asdf_1235-asdfa==+4123';
      const PHONE = '+7 1251 234 2 1 5';
      const PROMO = 'some value';
      const PASSWORD = 'user password';

      const CREATING_USER = { id: 5123, username: 'test-username' };
      const createUserStub = sinon.stub(memory.create, 'user');
      createUserStub.resolves(CREATING_USER);

      const CREATING_ACCOUNT = { id: 981 };
      const createTempAccount = sinon.stub(memory.create, 'accountFromTemplate');
      createTempAccount.resolves(CREATING_ACCOUNT);

      const hookStub = sinon.stub(amoHooks, 'accountCreated');
      const linkStub = sinon.stub(entryLink, 'makeEntryLink');
      linkStub.resolves('test link');

      request.post('/register')
        .send({
          username: CREATING_USER.username,
          utm_term: UTM,
          phone: PHONE,
          promo: PROMO,
          password: PASSWORD,
          requestPresentation: true,
          utm_campaign: 'hahaha-camp-oj',
        })
        .end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(201);
          expect(createTempAccount.calledOnce).to.be.true;
          expect(createUserStub.calledOnce).to.be.true;
          expect(createUserStub.firstCall.args[0]).to.include({
            role: 'admin',
            password: PASSWORD,
            username: CREATING_USER.username,
            accountId: CREATING_ACCOUNT.id,
          });
          expect(hookStub.calledOnce).to.be.true;
          expect(hookStub.firstCall.args).to.deep.equal([CREATING_ACCOUNT, CREATING_USER, {
            password: PASSWORD,
            utm_term: UTM,
            email: CREATING_USER.username,
            phone: PHONE,
            promo: PROMO,
            requestPresentation: true,
            utm_campaign: 'hahaha-camp-oj',
          }]);
          done();
        });
    });

    it('В amo передаётся флаг en, если есть такой параметр в query', async () => {
      const [account, user] = await Promise.all([
        db.Account.create({ name: 'test' }),
        memory.create.user({ username: 'test', password: 'test' }),
      ]);
      const createAccountStub = sinon.stub(memory.create, 'accountFromTemplate');
      createAccountStub.resolves(account);
      const createUserStub = sinon.stub(memory.create, 'user');
      createUserStub.resolves(user);
      const hookStub = sinon.stub(amoHooks, 'accountCreated');

      await new Promise((resolve) => {
        request.post('/register')
          .send({ username: 'holy god' })
          .query({ en: 1 })
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(201);
            expect(hookStub.calledOnce).to.be.true;
            expect(hookStub.firstCall.args[2]).to.have.property('en', true);
            resolve();
          });
      });
    });

    it('В ответе содержится корректная ссылка', async () => {
      const [account, user] = await Promise.all([
        db.Account.create({ name: 'test' }),
        memory.create.user({ username: 'test', password: 'test' }),
      ]);
      const createAccountStub = sinon.stub(memory.create, 'accountFromTemplate');
      createAccountStub.resolves(account);
      const createUserStub = sinon.stub(memory.create, 'user');
      createUserStub.resolves(user);
      sinon.stub(amoHooks, 'accountCreated');
      const entryLinkStub = sinon.stub(entryLink, 'makeEntryLink');
      const ENTRY_LINK = 'some entry link value';
      entryLinkStub.resolves(ENTRY_LINK);

      await new Promise((resolve) => {
        request.post('/register')
          .send({ username: 'this username will be ignored' })
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(201);
            expect(entryLinkStub.calledOnce).to.be.true;
            expect(entryLinkStub.firstCall.args[0]).to.include({
              userId: user.id,
              fromRegistration: true,
            });
            expect(res.body).to.be.an('object');
            expect(res.body).to.deep.equal({
              entryLink: ENTRY_LINK,
            });
            resolve();
          });
      });
    });
    it('Аккаунт не создаётся, если ошибка при создании пользователя', async () => {
      const createAccountSpy = sinon.spy(memory.create, 'accountFromTemplate');
      sinon.stub(memory.create, 'user').rejects();
      await db.Account.create({ name: 'template' });

      await new Promise((resolve) => {
        request.post('/register')
          .send({ username: 'test' })
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(500);
            resolve();
          });
      });

      expect(createAccountSpy.called).to.be.true;
      const [accountName] = createAccountSpy.getCall(0).args;
      const account = await db.Account.findOne({
        where: { name: accountName },
      });
      expect(account).to.not.exist;
    });
    it('Аккаунт и пользователь не создаются, если ошибка из amo', async () => {
      const createAccountSpy = sinon.spy(memory.create, 'accountFromTemplate');
      const createUserSpy = sinon.spy(memory.create, 'user');
      sinon.stub(amoHooks, 'accountCreated').rejects();
      await db.Account.create({ name: 'template' });

      await new Promise((resolve) => {
        request.post('/register')
          .send({ username: 'test' })
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(500);
            resolve();
          });
      });

      const [accountName] = createAccountSpy.firstCall.args;
      const [{ username }] = createUserSpy.firstCall.args;
      const [account, user] = await Promise.all([
        db.Account.findOne({ where: { name: accountName } }),
        db.User.findOne({ where: { username } }),
      ]);
      expect(account).to.not.exist;
      expect(user).to.not.exist;
    });
    it('Аккаунт и пользователь не создаются, если ошибка при создании ссылки', async () => {
      const createAccountSpy = sinon.spy(memory.create, 'accountFromTemplate');
      const createUserSpy = sinon.spy(memory.create, 'user');
      sinon.stub(entryLink, 'makeEntryLink').rejects();
      await db.Account.create({ name: 'template' });

      await new Promise((resolve) => {
        request.post('/register')
          .send({ username: 'test' })
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(500);
            resolve();
          });
      });

      const [accountName] = createAccountSpy.firstCall.args;
      const [{ username }] = createUserSpy.firstCall.args;
      const [account, user] = await Promise.all([
        db.Account.findOne({ where: { name: accountName } }),
        db.User.findOne({ where: { username } }),
      ]);
      expect(account).to.not.exist;
      expect(user).to.not.exist;
    });
    it.skip('При одновременной регистрации не происходит проблем', async () => {
      const COUNT = 10;

      const usernames = new Array(COUNT).fill(0).map((v, index) => `test-${index}`);
      await Promise.all(usernames.map(
        (username) => new Promise((resolve) => {
          request.post('/register')
            .send({ username })
            .end((err, res) => {
              expect(err).to.not.exist;
              expect(res).to.have.status(201);
              resolve();
            });
        }),
      ));
    });
  });

  context('POST /reset', () => {
    it('400 empty_username, если не предоставлен username', (done) => {
      request.post('/reset')
        .end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(400);
          expect(res).to.have.property('text', 'empty_username');
          done();
        });
    });
    it('404 User not found, если пользователя не существует', (done) => {
      request.post('/reset')
        .send({ username: 'some unexistent username' })
        .end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(404);
          expect(res).to.have.property('text', 'User not found');
          done();
        });
    });
    it('204, передаёт нужного пользователя в mailer', async () => {
      const user = await memory.create.user({ username: 'test', password: 'test' });
      const mailerStub = sinon.stub(mailer, 'resetUser');
      const findUserStub = sinon.stub(memory, 'findUserByUsername');
      findUserStub.resolves(user);

      await new Promise((resolve) => {
        request.post('/reset')
          .send({ username: user.username })
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(204);
            expect(findUserStub.calledOnceWithExactly(user.username)).to.be.true;
            expect(mailerStub.calledOnce).to.be.true;
            expect(mailerStub.calledWithExactly(user)).to.be.true;
            resolve();
          });
      });
    });
    it('500, если mailer.resetUser выкидывает ошибку', async () => {
      const user = await memory.create.user({ username: 'test', password: 'test' });
      sinon.stub(mailer, 'resetUser').rejects();

      await new Promise((resolve) => {
        request.post('/reset')
          .send({ username: user.username })
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(500);
            resolve();
          });
      });
    });
  });

  context('POST /auth-token', () => {
    it('400 no_username_or_password, если нет username', (done) => {
      request.post('/auth-token')
        .send({ password: 'hey!' })
        .end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(400);
          expect(res).to.have.property('text', 'no_username_or_password');
          done();
        });
    });
    it('400 no_username_or_password, если нет password', (done) => {
      request.post('/auth-token')
        .send({ username: 'hey!' })
        .end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(400);
          expect(res).to.have.property('text', 'no_username_or_password');
          done();
        });
    });
    it('400 invalid_username_or_password, если пользователя нет', (done) => {
      request.post('/auth-token')
        .send({ username: 'test', password: 'hey!' })
        .end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(400);
          expect(res).to.have.property('text', 'invalid_username_or_password');
          done();
        });
    });
    it('400 invalid_username_or_password, если пароль неверный', async () => {
      await memory.create.user({ username: 'test', password: 'pass' });

      await new Promise((resolve) => {
        request.post('/auth-token')
          .send({ username: 'test', password: 'fail pass' })
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(400);
            expect(res).to.have.property('text', 'invalid_username_or_password');
            resolve();
          });
      });
    });
    it('jwt в теле ответа совпадает с результатом setSignJwt', async () => {
      const FAKE_TOKEN = 'fake.jwt.token-6161#%!%@291919';
      const tokenStub = sinon.stub(memory, 'setSignJwt').resolves(FAKE_TOKEN);
      const user = await memory.create.user({ username: 'test', password: 'pass' });

      await new Promise((resolve) => {
        request.post('/auth-token')
          .send({ username: 'test', password: 'pass' })
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(200);
            expect(res.body).to.deep.equal({
              jwt: FAKE_TOKEN,
            });
            expect(tokenStub.calledOnce).to.be.true;
            expect(tokenStub.getCall(0).args[0]).to.have.property('id', user.id);
            resolve();
          });
      });
    });
  });

  context('POST /entry', () => {
    it('400 Empry key, если ключ не предоставлен', (done) => {
      request.post('/entry')
        .end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(400);
          expect(res.text).to.equal('Empty key');
          done();
        });
    });
    it('Возвращает токен из useEntryKey', (done) => {
      const FAKE_TOKEN = 'fake-token';
      const KEY = 'some key!';
      const entryKeyStub = sinon.stub(entries, 'useEntryKey').resolves(FAKE_TOKEN);

      request.post('/entry')
        .send({ key: KEY })
        .end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(200);
          expect(res.body).to.deep.equal({
            token: FAKE_TOKEN,
          });
          expect(entryKeyStub.calledWithExactly(KEY)).to.be.true;
          done();
        });
    });
    it('400 expired, если useEntryKey выбрасывает ошибку', (done) => {
      sinon.stub(entries, 'useEntryKey').rejects();

      request.post('/entry')
        .send({ key: 'some key value, not empty' })
        .end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(400);
          expect(res.text).to.equal('expired');
          done();
        });
    });
  });

  context('GET /payment-rates', () => {
    afterEach(async () => {
      await db.PaymentRates.destroy({ truncate: true });
    });

    it('204, если в базе пусто', (done) => {
      request.get('/payment-rates').end((err, res) => {
        expect(err).to.not.exist;
        expect(res).to.have.status(204);
        done();
      });
    });
    it('Возвращает цены из базы', async () => {
      const VALUES = {
        base: 512,
        extended: 120923,
        professional: 1234232,
      };
      await db.PaymentRates.create(VALUES);

      await new Promise((resolve) => {
        request.get('/payment-rates').end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(200);
          expect(res.body).to.deep.equal(VALUES);
          resolve();
        });
      });
    });
    it('Если в базе несколько записей, возвращает первую лишь', async () => {
      const VALUES = [{
        base: 8342,
        extended: 15123,
        professional: 77171,
      }, {
        base: 1213,
        extended: 44412,
        professional: 142525,
      }];
      await db.PaymentRates.bulkCreate(VALUES);

      await new Promise((resolve) => {
        request.get('/payment-rates').end((err, res) => {
          expect(err).to.not.exist;
          expect(res).to.have.status(200);
          expect(res.body).to.deep.equal(VALUES[0]);
          resolve();
        });
      });
    });
  });
});
