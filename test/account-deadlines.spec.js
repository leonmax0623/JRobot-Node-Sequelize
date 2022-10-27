const chai = require('chai');
const db = require('../data/models');
const { updateDeadlines } = require('../src/tools/account-deadlines');
const { truncateModels } = require('./utils');

const { expect } = chai;

describe('account-deadlines.updateDeadlines', () => {
  before(async () => {
    await db.sequelize.sync({ force: true });
  });

  afterEach(async () => {
    await truncateModels('Account');
    // await db.sequelize.query('set FOREIGN_KEY_CHECKS = 0');
    // await Promise.all([
    //   db.Account.destroy({ truncate: true }),
    // ]);
    // await db.sequelize.query('set FOREIGN_KEY_CHECKS = 1');
  });

  after(async () => {
    // await db.sequelize.close();
  });

  it('Корректно обновляет аккаунт, если дедлайн был 15 дней назад', async () => {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() - 15);

    await db.Account.create({
      name: 'test',
      remainingMonths: 5,
      deadline,
      timeLeft: 4152,
      timePerMonth: 591928,
    });

    await updateDeadlines();

    const account = await db.Account.findOne();
    expect(account.remainingMonths).to.equal(4);
    expect(account.timeLeft).to.equal(591928);
    const nextDeadline = new Date(deadline);
    nextDeadline.setMonth(nextDeadline.getMonth() + 1);
    expect(account.deadline).to.be.a('Date');
    expect(dateToObject(account.deadline)).to.deep.equal(dateToObject(nextDeadline));
  });

  it('Корректно обновляет аккаунт, если дедлайн был сегодня', async () => {
    const deadline = new Date();
    // deadline.setDate(deadline.getDate() - 1);
    deadline.setHours(0, 0, 0, 0);
    const nextDeadline = new Date(deadline);
    nextDeadline.setMonth(nextDeadline.getMonth() + 1);
    const timePerMonth = 512361;
    await db.Account.create({
      name: 'test',
      remainingMonths: 8,
      deadline,
      timeLeft: 0,
      timePerMonth,
    });

    await updateDeadlines();

    const account = await db.Account.findOne();
    expect(account.remainingMonths).to.equal(7);
    expect(account.timeLeft).to.equal(timePerMonth);
    expect(account.deadline).to.be.a('Date');
    expect(dateToObject(account.deadline)).to.deep.equal(dateToObject(nextDeadline));
  });

  it('Ничего не делает с аккаунтом, если дедлайн сегодня будет', async () => {
    const deadline = new Date();
    deadline.setHours(23, 59, 0, 0);
    const { remainingMonths, timeLeft } = await db.Account.create({
      name: 'test',
      remainingMonths: 3,
      deadline,
      timeLeft: 2234,
      timePerMonth: 1512361,
    });

    await updateDeadlines();

    const account = await db.Account.findOne();
    expect(account).to.deep.include({
      remainingMonths,
      timeLeft,
    });
    expect(dateToObject(account.deadline)).to.deep.equal(dateToObject(deadline));
  });

  it('Ничего не делает, если дедлайн пройден, но remainingMonths = 0', async () => {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() - 5);
    const { remainingMonths, timeLeft } = await db.Account.create({
      name: 'test',
      remainingMonths: 0,
      deadline,
      timeLeft: 2234,
      timePerMonth: 1512361,
    });

    await updateDeadlines();

    const account = await db.Account.findOne();
    expect(account).to.deep.include({
      remainingMonths,
      timeLeft,
    });
    expect(dateToObject(account.deadline)).to.deep.equal(dateToObject(deadline));
  });

  it('Ничего не делает, если дедлайн пройден, но remainingMonths < 0', async () => {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() - 5);
    const { remainingMonths, timeLeft } = await db.Account.create({
      name: 'test',
      remainingMonths: -10,
      deadline,
      timeLeft: 2234,
      timePerMonth: 1512361,
    });

    await updateDeadlines();

    const account = await db.Account.findOne();
    expect(account).to.deep.include({
      remainingMonths,
      timeLeft,
    });
    expect(dateToObject(account.deadline)).to.deep.equal(dateToObject(deadline));
  });
});

/**
 * @param {Date} date
 */
function dateToObject(date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    date: date.getDate(),
    hours: date.getHours(),
    minutes: date.getMinutes(),
    seconds: date.getSeconds(),
  };
}
