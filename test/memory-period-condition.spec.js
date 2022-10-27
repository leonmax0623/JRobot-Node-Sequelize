const chai = require('chai');

const memory = require('../src/tools/memory');

const { expect } = chai;
const {
  periodCondition, sqlDatetime, db, select,
} = memory;

describe('memory.periodCondition', () => {
  context('Возвращаемый результат сам по себе', () => {
    it('null, если нет start и end', async () => {
      const result = periodCondition('Yeadaada', {});

      expect(result).to.be.null;
    });

    it('x >= start', async () => {
      const column = 'SoMeTest."Column"';
      const start = new Date(2010, 2, 5, 6, 1, 2);

      const result = periodCondition(column, { start });

      expect(result).to.equal(`${column} >= ${sqlDatetime(start)}`);
    });

    it('x <= end', async () => {
      const column = 'createdAt';
      const end = new Date(2050, 2, 5, 6, 1, 2);

      const result = periodCondition(column, { end });

      expect(result).to.equal(`${column} <= ${sqlDatetime(end)}`);
    });

    it('start <= x <= end', async () => {
      const column = 'Sessions."updatedAt"';
      const start = new Date(1998, 2, 28, 8, 2, 59);
      const end = new Date(2030, 10, 5, 6, 1, 2);

      const result = periodCondition(column, { start, end });

      expect(result).to.equal(`${column} between ${sqlDatetime(start)} and ${sqlDatetime(end)}`);
    });
  });

  context('Результат действительно работает в запросах', () => {
    let scripts;

    before(async () => {
      await db.sequelize.sync({ force: true });

      // Проверять буду на сценариях, поле destroyedAt

      const dates = [];
      for (let i = 0; i < 365; i += 1) {
        const date = new Date(2020, 0, 0);
        date.setDate(i);
        dates.push(date);
      }

      scripts = await db.Script.bulkCreate(
        dates.map((value) => ({
          destroyedAt: value,
        })),
      );
    });

    it('Корректная выборка только при start', async () => {
      const start = new Date(2020, 5, 24, 5);
      const validScripts = scripts
        .filter(({ destroyedAt }) => destroyedAt >= start);

      const period = periodCondition('"destroyedAt"', { start });
      const [{ value }] = await select(`select count(*) "value" from "Scripts" where ${period}`);

      expect(value).to.equal(validScripts.length);
    });

    it('Корректная выборка только при end', async () => {
      const end = new Date(2020, 6, 10, 5);
      const validScripts = scripts
        .filter(({ destroyedAt }) => destroyedAt <= end);

      const period = periodCondition('"destroyedAt"', { end });
      const [{ value }] = await select(`select count(*) "value" from "Scripts" where ${period}`);

      expect(value).to.equal(validScripts.length);
    });

    it('Корректная выборка при start и end', async () => {
      const start = new Date(2020, 2, 24, 5);
      const end = new Date(2020, 7, 10, 5);
      const validScripts = scripts
        .filter(({ destroyedAt }) => destroyedAt <= end && destroyedAt >= start);

      const period = periodCondition('"destroyedAt"', { start, end });
      const [{ value }] = await select(`select count(*) "value" from "Scripts" where ${period}`);

      expect(value).to.equal(validScripts.length);
    });
  });
});
