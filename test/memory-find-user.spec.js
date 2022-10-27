const chai = require('chai');
const memory = require('../src/tools/memory');
const { truncateModels } = require('./utils');

const { expect } = chai;
const { db, findUserByUsername } = memory;

describe('memory.findUserByUsername', () => {
  before(async () => {
    await db.sequelize.sync({ force: true });
  });

  beforeEach(async () => {
    await truncateModels('User');
  });

  after(async () => {
    // await db.sequelize.close();
  });

  it('Находит test и TeSt', async () => {
    const user = await memory.create.user({ username: 'test', password: 'test' });

    const finded = await findUserByUsername('TeSt');

    expect(finded).to.exist;
    expect(finded).to.include({ id: user.id });
  });
  it('Находит 1241TEST и 1241test', async () => {
    const user = await memory.create.user({ username: '1241test', password: 'test' });

    const finded = await findUserByUsername('1241TEST');

    expect(finded).to.exist;
    expect(finded).to.include({ id: user.id });
  });
  it('Находит Te-1-^-*!*!+++__#', async () => {
    const user = await memory.create.user({ username: 'tE-1-^-*!*!+++__#', password: 'test' });

    const finded = await findUserByUsername('Te-1-^-*!*!+++__#');

    expect(finded).to.exist;
    expect(finded).to.include({ id: user.id });
  });
  it('Не находит 125test', async () => {
    await memory.create.user({ username: '125test', password: 'test' });

    const finded = await findUserByUsername('test');

    expect(finded).to.not.exist;
  });
  it('Не находит test)))', async () => {
    await memory.create.user({ username: 'test)))', password: 'test' });

    const finded = await findUserByUsername('test');

    expect(finded).to.not.exist;
  });
  it('Не находит $test&&??', async () => {
    await memory.create.user({ username: '$test&&??', password: 'test' });

    const finded = await findUserByUsername('test');

    expect(finded).to.not.exist;
  });
  it('Есть test@mail.com, ищем test_mail.com. Найти не должен', async () => {
    await memory.create.user({ username: 'test@mail.com', password: 'test' });

    const finded = await findUserByUsername('test_mail.com');

    expect(finded).to.not.exist;
  });
  it('Есть test@mail.com, ищем test%. Найти не должен', async () => {
    await memory.create.user({ username: 'test@mail.com', password: 'test' });

    const finded = await findUserByUsername('test%');

    expect(finded).to.not.exist;
  });
  it('Есть test@mail.com, ищем %test%. Найти не должен', async () => {
    await memory.create.user({ username: 'test@mail.com', password: 'test' });

    const finded = await findUserByUsername('%test%');

    expect(finded).to.not.exist;
  });
});
