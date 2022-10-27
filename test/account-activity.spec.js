const chai = require('chai');
// const chalk = require('chalk');
const timekeeper = require('timekeeper');
const memory = require('../src/tools/memory');

const { db, isAccountActive } = memory;
const { expect } = chai;

const NOW = new Date(2020, 4, 5, 12, 1, 6, 2);

describe('memory.isAccountActive', () => {
  let account;

  before(async () => {
    await db.sequelize.sync({ force: true });
    timekeeper.freeze(NOW);
  });

  after(async () => {
    timekeeper.reset();
  });

  context('Обычный аккаунт', () => {
    before(async () => {
      account = await db.Account.create({
        name: 'Test account',
      });
    });

    cases(({
      deadline, active, caption, timeLeft,
    }) => {
      const expected = (
        active
        && (
          new Date(deadline).setHours(0, 0, 0, 0)
          >= new Date(NOW).setHours(0, 0, 0, 0)
        )
        && timeLeft > 0
      );

      it(`${expected ? 'Активен' : 'Остановлен'} (${caption})`, async () => {
        await account.update({ deadline, active, timeLeft });

        expect(await isAccountActive(account.id)).to.equal(expected);
      });
    });
  });

  context('Партнёрский аккаунт', () => {
    before(async () => {
      account = await db.Account.create({ name: 'partner account', partner: true });
    });

    cases(({
      deadline, active, caption, timeLeft,
    }) => {
      it(`${active ? 'Активен' : 'Приостановлен'} (${caption})`, async () => {
        await account.update({ deadline, active, timeLeft });

        expect(await isAccountActive(account.id)).to.equal(active);
      });
    });
  });
});

function cases(callback) {
  for (const active of [false, true]) {
    for (const timeLeft of [-1215215, 0, 152]) {
      const past = new Date(NOW);
      past.setFullYear(past.getFullYear() - 1);
      const yesterday = new Date(NOW);
      yesterday.setDate(yesterday.getDate() - 1);
      const todayPast = new Date(NOW);
      todayPast.setHours(2);
      const todayFuture = new Date(NOW);
      todayFuture.setHours(20);
      const tomorrow = new Date(NOW);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const future = new Date(NOW);
      future.setFullYear(future.getFullYear() + 1);

      // const farAwayDealine = new Date();
      // farAwayDealine.setDate(farAwayDealine.getDate() + 40);
      // const firedDeadline = new Date();
      // firedDeadline.setFullYear(firedDeadline.getFullYear() - 5);

      for (const [deadline, deadlineCaption] of [
        [past, 'год назад'],
        [yesterday, 'вчера'],
        [todayPast, 'сегодня пораньше'],
        [todayFuture, 'сегодня попозже'],
        [tomorrow, 'завтра'],
        [future, 'через год'],
      ]) {
        // const deadlineCaption = deadline > new Date() ? 'не пройден' : 'пройден';
        // const timeLeftCaption = timeLeft > 0 ? '> 0' : '<= 0';
        const captionParts = [
          `active: ${active ? 'да' : 'нет'}`,
          `timeLeft: ${timeLeft > 0 ? '> 0' : '<= 0'}`,
          `deadline: ${deadlineCaption}`,
        ];
        const caption = captionParts.join(', ');
        callback({
          caption, active, timeLeft, deadline,
        });
      }
    }
  }
}
