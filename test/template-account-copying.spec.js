const chai = require('chai');

const { expect } = chai;
const should = chai.should();

const memory = require('../src/tools/memory');

const { db, create: { accountFromTemplate: createAccountByTemplate } } = memory;

// Заготовки
const scriptTemplates = [{
  meta: {
    some_meta_field: 'Some data',
    title: 'Super title',
    description: 'Desc',
  },
  structure: {
    address: 'Name',
    name: 'surname',
  },
}, {
  meta: {
    yeeeep: 'Noooo',
    test: 'field',
    nested: {
      data: true,
    },
  },
  structure: {
    root: null,
    examination: false,
  },
}, {
  meta: {
    information: {
      nestedField: {
        anotherNested: {
          value: 'foo',
          bar: 'value',
        },
      },
    },
  },
  structure: null,
}];

describe('memory.create.accountFromTemplate', () => {
  before(async () => {
    // Очистка базы данных
    await db.sequelize.sync({ force: true });

    // Создание шаблонного аккаунта
    const account = await db.Account.create({
      name: 'template',
    });

    await db.Script.bulkCreate(
      scriptTemplates.map((script) => ({
        ...script,
        accountId: account.id,
      })),
    );
  });

  beforeEach(async () => {
    await db.Account.destroy({
      where: {
        name: {
          [memory.Op.ne]: 'template',
        },
      },
    });
  });

  after(async () => {
    // await db.sequelize.close();
  });


  it('У нового аккаунта корректное имя', async () => {
    const newAccountName = 'Awesome custom account name';

    const account = await createAccountByTemplate(newAccountName);

    should.exist(account);
    account.name.should.equal(newAccountName);
  });

  it('У нового аккаунта корректный leadId', async () => {
    const newAccountName = 'Awesome custom account name';
    const leadId = 151235125;

    const account = await createAccountByTemplate(newAccountName, leadId);

    should.exist(account);
    account.leadId.should.equal(leadId);
  });

  it('Корректно скопированы сценарии', async () => {
    const account = await createAccountByTemplate('New account from template');

    should.exist(account);

    const scripts = await db.Script.findAll({
      where: {
        accountId: account.id,
      },
    });
    scripts.length.should.equal(scriptTemplates.length);
    scripts.forEach(({ meta, structure }, index) => {
      expect(meta).to.deep.equal(scriptTemplates[index].meta);
      expect(structure).to.deep.equal(scriptTemplates[index].structure);
    });
  });

  it('При rollback-е транзакции ничего не создаётся вообще', async () => {
    const countsBefore = await Promise.all([
      db.Account.count(),
      db.User.count(),
      // db.Course.count(),
      db.Script.count(),
      // db.CourseStep.count(),
    ]);

    const rollbackError = new Error('rollback');
    try {
      await db.sequelize.transaction(async () => {
        await createAccountByTemplate('test', null);
        throw rollbackError;
      });
      expect.fail('Error not thrown');
    } catch (err) {
      expect(err).to.equal(rollbackError);
    }
    // const transaction = await db.sequelize.transaction();
    // await createAccountByTemplate('test', null);
    // await transaction.rollback();

    const countsAfter = await Promise.all([
      db.Account.count(),
      db.User.count(),
      // db.Course.count(),
      db.Script.count(),
      // db.CourseStep.count(),
    ]);
    expect(countsAfter).to.deep.equal(countsBefore);
  });

  it('Можно создавать несколько аккаунтов из шаблона и ничего страшного', async () => {
    const names = new Array(3).fill(0).map((v, x) => `test-${x}`);
    await Promise.all(names.map(
      (name) => createAccountByTemplate(name),
    ));
  });

  it('Переносятся и подписки шаблонного аккаунта', async () => {
    const partner = await db.Account.create({ name: 'partner', partner: true });
    const { id: accountId } = partner;
    const partnerScripts = await db.Script.bulkCreate([
      { accountId },
      { accountId, public: true },
      { accountId, public: true, destroyedAt: new Date() },
    ]);
    const template = await db.Account.findOne({ where: { name: 'template' } });
    await template.addPartnerScripts(partnerScripts.map(({ id }) => id));

    const account = await createAccountByTemplate('test');

    const scripts = await account.getPartnerScripts({ attributes: ['id'] });
    expect(scripts.map(({ id }) => id)).to.have.members(partnerScripts.map(({ id }) => id));
  });
});
