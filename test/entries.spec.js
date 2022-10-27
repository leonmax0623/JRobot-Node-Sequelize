const chai = require('chai');
const sinon = require('sinon');
const timekeeper = require('timekeeper');
const chalk = require('chalk');

const memory = require('../src/tools/memory');
const entries = require('../src/tools/entries');
const entryLink = require('../src/tools/entry-link');
const { truncateModels } = require('./utils');

const { db } = memory;
const { expect } = chai;

describe('Entries', () => {
  before(async () => {
    await db.sequelize.sync({ force: true });
  });

  afterEach(async () => {
    await truncateModels('User', 'Entry');
    // await Promise.all([
    //   db.User.destroy({ truncate: true }),
    //   db.Entry.destroy({ truncate: true }),
    // ]);
  });

  after(async () => {
    // await db.sequelize.close();
  });

  context('.makeEntryKey', () => {
    it('В базе появляется запись', async () => {
      const user = await memory.create.user({
        username: 'test',
        password: 'test',
      });

      const key = await entries.makeEntryKey(user.id);

      expect(key).to.exist;
      expect(key).to.be.a('string');

      const entry = await db.Entry.findOne({
        where: {
          uuid: key,
          userId: user.id,
        },
      });

      expect(entry).to.exist;
    });
    it('Кидает ошибку, если пользователь не существует', async () => {
      try {
        await entries.makeEntryKey(515);
        expect.fail('Not throwed');
      } catch (err) {
        expect(err).to.exist;
      }
    });
    it('Не удаляет уже существующий ключ', async () => {
      const user = await memory.create.user({
        username: 'test',
        password: 'test',
      });

      const key = await entries.makeEntryKey(user.id);

      expect(key).to.exist;
      expect(key).to.be.a('string');
      expect(
        await db.Entry.findOne({
          where: {
            uuid: key,
            userId: user.id,
          },
        }),
      ).to.exist;

      const secondKey = await entries.makeEntryKey(user.id);

      expect(
        await db.Entry.findOne({
          where: {
            uuid: key,
            userId: user.id,
          },
        }),
      ).to.exist;
      expect(
        await db.Entry.findOne({
          where: {
            uuid: secondKey,
            userId: user.id,
          },
        }),
      ).to.exist;
    });
  });

  context('.useEntryKey', () => {
    afterEach((done) => {
      sinon.restore();
      timekeeper.reset();
      done();
    });

    it('Возвращаемая строка совпадает с результатом вызова memory.setSignJwt', async () => {
      const FAKE_TOKEN = 'test-super.test value %!%!%@352 101001-`-`-`';
      const stub = sinon.stub(memory, 'setSignJwt');
      stub.resolves(FAKE_TOKEN);
      const user = await memory.create.user({
        username: 'test',
        password: 'test',
      });
      const entry = await db.Entry.create({
        uuid: 'some key',
        userId: user.id,
      });

      const result = await entries.useEntryKey(entry.uuid);

      expect(result).to.exist;
      expect(result).to.equal(FAKE_TOKEN);
    });

    it('Ошибка \'Entry not found\', если ключа не существует', async () => {
      try {
        await entries.useEntryKey();
        expect.fail('Error not thrown');
      } catch (err) {
        expect(err).to.be.an('error');
        expect(err).to.have.property('message', 'Entry not found');
      }
    });

    it('Ошибки нет через 6 дней', async () => {
      const FAKE_TOKEN = 'test-super.test value %!%!%@352 101001-`-`-`';
      const stub = sinon.stub(memory, 'setSignJwt');
      stub.resolves(FAKE_TOKEN);
      const user = await memory.create.user({
        username: 'test',
        password: 'test',
      });
      const time = Date.now();
      timekeeper.freeze(time);
      const entry = await db.Entry.create({
        uuid: 'some key',
        userId: user.id,
      });
      timekeeper.freeze(time + 6 * 24 * 60 * 60e3);

      const token = await entries.useEntryKey(entry.uuid);

      expect(token).to.exist;
      expect(token).to.equal(FAKE_TOKEN);
    });

    it('Ошибка \'Entry expired\', если прошло 60 дней', async () => {
      const time = Date.now();
      timekeeper.freeze(time);
      const entry = await db.Entry.create({
        uuid: 'some key',
        userId: null,
      });
      timekeeper.freeze(time + 60 * 24 * 60 * 60e3 + 1000);

      try {
        await entries.useEntryKey(entry.uuid);
        expect.fail('Error not thrown');
      } catch (err) {
        expect(err).to.be.an('error');
        expect(err).to.have.property('message', 'Entry expired');
      }
    });

    it('Ошибка \'Entry has not userId\', если у ключа в базе нет userId', async () => {
      const entry = await db.Entry.create({
        uuid: 'some key',
        userId: null,
      });

      try {
        await entries.useEntryKey(entry.uuid);
        expect.fail('Error not thrown');
      } catch (err) {
        expect(err).to.be.an('error');
        expect(err).to.have.property('message', 'Entry has not userId');
      }
    });

    // Это не нужно, поскольку такого быть не может. FOREIGHN_KEYS упадёт в SQL
    // it('Ошибка \'User not found\', если пользователя нет', async () => {
    //   const entry = await db.Entry.create({
    //     uuid: 'some key',
    //     userId: 5125,
    //   });

    //   try {
    //     await entries.useEntryKey(entry.uuid);
    //     expect.fail('Error not thrown');
    //   } catch (err) {
    //     expect(err).to.be.an('error');
    //     expect(err).to.have.property('message', 'User not found');
    //   }
    // });
  });

  context('.makeEntryLink', () => {
    afterEach((done) => {
      sinon.restore();
      done();
    });

    it(chalk`https://app.jrobot.pro/entry?key={italic value}`, async () => {
      const KEY = 'SOME-UNIQUE-KEY';
      const USER_ID = 5151252;
      const stub = sinon.stub(entries, 'makeEntryKey');
      stub.resolves(KEY);

      const link = await entryLink.makeEntryLink({ userId: USER_ID });

      expect(stub.getCall(0).calledWithExactly(USER_ID)).to.be.true;
      expect(link).to.equal(`https://app.jrobot.pro/entry?key=${KEY}`);
    });

    it(chalk`https://app.jrobot.pro/entry?key={italic value}&reg=1`, async () => {
      const KEY = '51512-1112424-55161616161';
      const USER_ID = 5151252;
      const stub = sinon.stub(entries, 'makeEntryKey');
      stub.resolves(KEY);

      const link = await entryLink.makeEntryLink({ userId: USER_ID, fromRegistration: true });

      expect(stub.getCall(0).calledWithExactly(USER_ID)).to.be.true;
      // console.log(link);
      expect(link).to.equal(`https://app.jrobot.pro/entry?key=${KEY}&reg=1`);
    });
  });
});
