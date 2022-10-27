const chai = require('chai');
const chaiHTTP = require('chai-http');
// const chalk = require('chalk');
const sinon = require('sinon');

chai.use(chaiHTTP);

const memory = require('../src/tools/memory');
const server = require('../src/app');
const hash = require('../src/tools/hashing');
const { truncateModels } = require('./utils');

const { expect } = chai;
const { db } = memory;

let request;

describe('Метод /profile', () => {
  before(async () => {
    request = chai.request(server.listen(7001)).keepOpen();
    await db.sequelize.sync({ force: true });
  });

  after(async () => {
    request.close();
  });

  context('GET', () => {
    let account;
    let group;
    let stud;
    let manager;
    let studGroup;
    let managerGroup;
    let admin;

    before(async () => {
      account = await db.Account.create({
        name: 'get-test',
        speechRecognitionType: 'app',
      });
      const { id: accountId } = account;
      const password = 'pass';
      group = await db.Group.create({ name: 'group', accountId });
      const { id: groupId } = group;
      [admin, manager, managerGroup, stud, studGroup] = await Promise.all([
        memory.create.user({
          role: 'admin', username: 'admin', password, accountId,
        }),
        memory.create.user({
          role: 'manager', username: 'manager', password, accountId,
        }),
        memory.create.user({
          role: 'manager', username: 'manager-group', password, accountId, groupId,
        }),
        memory.create.user({
          role: 'student', username: 'student', password, accountId,
        }),
        memory.create.user({
          role: 'student', username: 'student-group', password, accountId, groupId,
        }),
      ]);
    });

    after(async () => {
      await truncateModels('Account', 'Group', 'User');
    });

    afterEach(async () => {
      sinon.restore();
    });

    // help function
    async function getProfile(user) {
      const token = await memory.setSignJwt(user);

      return new Promise((resolve) => {
        request.get('/profile')
          .set('Authorization', `JWT ${token}`)
          .end((err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(200);
            resolve(res.body);
          });
      });
    }

    it('Студент запрашивает', async () => {
      const activeStub = sinon.stub(memory, 'isAccountActive').resolves(true);

      const data = await getProfile(stud);

      expect(data).to.deep.equal({
        id: stud.id,
        username: stud.username,
        role: 'student',
        name: stud.name,
        account: {
          active: true,
          speechRecognitionType: account.speechRecognitionType,
          name: account.name,
        },
      });
      expect(activeStub.firstCall.calledWithExactly(account.id)).to.be.true;
    });

    it('Студент в группе запрашивает', async () => {
      const activeStub = sinon.stub(memory, 'isAccountActive').resolves(false);

      const data = await getProfile(studGroup);

      expect(data).to.deep.equal({
        id: studGroup.id,
        username: studGroup.username,
        role: 'student',
        name: studGroup.name,
        grouped: true,
        groupName: group.name,
        account: {
          active: false,
          speechRecognitionType: account.speechRecognitionType,
          name: account.name,
        },
      });
      expect(activeStub.firstCall.calledWithExactly(account.id)).to.be.true;
    });

    it('Менеджер запрашивает', async () => {
      const activeStub = sinon.stub(memory, 'isAccountActive').resolves(true);

      const data = await getProfile(manager);

      expect(data).to.deep.equal({
        id: manager.id,
        username: manager.username,
        role: 'manager',
        name: manager.name,
        account: {
          active: true,
          speechRecognitionType: account.speechRecognitionType,
          name: account.name,
        },
      });
      expect(activeStub.firstCall.calledWithExactly(account.id)).to.be.true;
    });

    it('Менеджер в группе запрашивает', async () => {
      const activeStub = sinon.stub(memory, 'isAccountActive').resolves(true);

      const data = await getProfile(managerGroup);

      expect(data).to.deep.equal({
        id: managerGroup.id,
        username: managerGroup.username,
        role: 'manager',
        name: managerGroup.name,
        grouped: true,
        groupName: group.name,
        account: {
          active: true,
          speechRecognitionType: account.speechRecognitionType,
          name: account.name,
        },
      });
      expect(activeStub.firstCall.calledWithExactly(account.id)).to.be.true;
    });

    it('Админ запрашивает, оплата разрешена', async () => {
      const active = false;
      const activeStub = sinon.stub(memory, 'isAccountActive').resolves(active);
      const accountData = {
        deadline: new Date(2020, 5, 2, 7, 1, 2),
        usersLimit: 512,
        remainingMonths: 19999,
        timePerMonth: 10,
        timeLeft: 1023512,
        partner: false,
        speechRecognitionType: 'native',
      };
      await account.update({
        leadId: 12512,
        allowPaymentRequests: true,
        ...accountData,
      });

      const data = await getProfile(admin);

      expect(data).to.have.all.keys('id', 'role', 'username', 'name', 'account');
      {
        const {
          id, name, username, role,
        } = admin;
        expect(data).to.include({
          id, name, username, role,
        });
      }
      expect(data.account).to.deep.equal({
        ...accountData,
        deadline: accountData.deadline.toISOString(),
        allowPaymentRequests: true,
        name: account.name,
        active,
      });
      expect(activeStub.firstCall.calledWithExactly(account.id)).to.be.true;
    });

    it('allowPaymentRequests FALSE, если нет leadId', async () => {
      await account.update({
        leadId: null,
        allowPaymentRequests: true,
      });

      const data = await getProfile(admin);

      expect(data.account.allowPaymentRequests).to.be.false;
    });

    it('allowPaymentRequests FALSE, если нет флага', async () => {
      await account.update({
        leadId: 101029349,
        allowPaymentRequests: false,
      });

      const data = await getProfile(admin);

      expect(data.account.allowPaymentRequests).to.be.false;
    });
  });

  context('PATCH', () => {
    // Одинаково для админа, менеджера и студента
    let account;

    before(async () => {
      account = await db.Account.create({ name: 'patch-test' });
      await memory.create.user({
        username: 'ExiStED',
        password: 'pass',
      });
    });

    ['admin', 'manager', 'student'].forEach((role) => {
      context(`Роль - ${role}`, () => {
        let user;

        async function patch(data, callback) {
          const token = await memory.setSignJwt(user);

          return new Promise((resolve) => {
            request.patch('/profile')
              .send(data)
              .set('Authorization', `JWT ${token}`)
              .end(
                callback
                  ? (err, res) => { callback(err, res); resolve(); }
                  : (err, res) => {
                    expect(err).to.not.exist;
                    expect(res).to.have.status(204);
                    resolve();
                  },
              );
          });
        }

        beforeEach(async () => {
          user = await memory.create.user({
            role,
            username: role,
            password: 'bad password',
            name: 'bad name',
            accountId: account.id,
          });
        });

        afterEach(async () => {
          await user.destroy();
        });

        it('Обновляет username', async () => {
          const username = 'AWESOME';

          await patch({ username });

          const data = await db.User.findByPk(user.id);
          expect(data).to.include({ username: username.toLowerCase() });
        });

        it('Обновляет пароль', async () => {
          const password = 'new cool and strong password';

          await patch({ password });

          const data = await db.User.findByPk(user.id);
          expect(data).to.include({ passwordHash: hash(password) });
        });

        it('Обновляет имя', async () => {
          const name = 'oh no, it is my new own name....';

          await patch({ name });

          const data = await db.User.findByPk(user.id);
          expect(data).to.include({ name });
        });

        it('400 no_data, если нет данных', async () => {
          await patch({}, (err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(400);
            expect(res.text).to.equal('no_data');
          });
        });

        it('400 empty_password, если пароль пуст', async () => {
          await patch({ password: '' }, (err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(400);
            expect(res.text).to.equal('empty_password');
          });
        });

        it('400 empty_username, если username пуст', async () => {
          await patch({ username: '' }, (err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(400);
            expect(res.text).to.equal('empty_username');
          });
        });

        it('400 username_already_exists, если пользователь такой уже есть', async () => {
          await patch({ username: 'EXIsted' }, (err, res) => {
            expect(err).to.not.exist;
            expect(res).to.have.status(400);
            expect(res.text).to.equal('username_already_exists');
          });
        });
      });
    });
  });
});
