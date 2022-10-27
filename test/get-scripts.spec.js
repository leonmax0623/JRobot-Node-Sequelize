const chai = require('chai');
const chaiHTTP = require('chai-http');
const chalk = require('chalk');

chai.use(chaiHTTP);

const memory = require('../src/tools/memory');
const server = require('../src/app');
const { truncateModels } = require('./utils');

chai.should();
const { expect } = chai;
const { db } = memory;

let request;

describe(chalk`Тестирование метода API {magenta GET /scripts}`, () => {
  before(async () => {
    request = chai.request(server.listen(7001)).keepOpen();
    await db.sequelize.sync({ force: true });
  });

  after(async () => {
    request.close();
  });

  context('Общее', () => {
    let account;
    let scripts;
    const scriptsTemplates = [{
      meta: [1, 2, 3],
      structure: {
        somefield: 12512,
        data: 'hehehe',
        nested: {
          data: true,
        },
      },
    }, {
      meta: {
        caption: 'Caption amazing',
        data: {
          field: 1,
          examination: true,
        },
        description: null,
        groups: [1, 2, 3, 4, 5],
      },
      structure: null,
    }];

    beforeEach(async () => {
      await truncateModels('Account', 'User', 'Script');

      account = await db.Account.create({
        name: 'Test account',
      });
      [, scripts] = await Promise.all([
        memory.create.user({
          role: 'admin',
          username: 'admin',
          password: 'admin',
          accountId: account.id,
        }),
        db.Script.bulkCreate(
          scriptsTemplates.map((temp) => ({
            ...temp,
            accountId: account.id,
          })),
        ),
      ]);
    });

    context('Без id в query', () => {
      it('Должен вернуть только id и meta', async () => {
        const token = await getToken('admin', 'admin');
        await new Promise((resolve) => {
          request.get('/scripts')
            .set('Authorization', `JWT ${token}`)
            .end((err, res) => {
              expect(err).to.not.exist;
              res.should.have.status(200);
              res.body.should.be.a('array');
              expect(res.body).to.not.be.empty;
              res.body.forEach((item) => {
                expect(item).to.have.all.keys('id', 'meta', 'partner', 'partnerScriptCategoryId');
                expect(item).to.have.property('partner', null);
                expect(item).to.have.property('partnerScriptCategoryId', null);
                expect(item.id).to.be.a('number');
              });
              resolve();
            });
        });
      });

      it('Meta должна совпадать с шаблоном', async () => {
        const token = await getToken('admin', 'admin');
        await new Promise((resolve) => {
          request.get('/scripts')
            .set('Authorization', `JWT ${token}`)
            .end((err, res) => {
              expect(err).to.not.exist;
              res.should.have.status(200);
              res.body.should.be.a('array');
              expect(res.body).to.not.be.empty;
              res.body.forEach((item, index) => {
                expect(item).to.have.all.keys('id', 'meta', 'partner', 'partnerScriptCategoryId');
                expect(item).to.have.property('partner', null);
                expect(item).to.have.property('partnerScriptCategoryId', null);
                expect(item.id).to.be.a('number');
                item.meta.should.deep.equal(scriptsTemplates[index].meta);
              });
              resolve();
            });
        });
      });

      it('Состав сценариев должен быть эквивалентен данным в базе', async () => {
        const token = await getToken('admin', 'admin');
        await new Promise((resolve) => {
          request.get('/scripts')
            .set('Authorization', `JWT ${token}`)
            .end((err, res) => {
              expect(err).to.not.exist;
              res.should.have.status(200);
              res.body.should.be.a('array');
              res.body.length.should.equal(scriptsTemplates.length);
              res.body.forEach((item, index) => {
                const { id, meta } = scripts[index];
                item.should.deep.equal({
                  id, meta, partner: null, partnerScriptCategoryId: null,
                });
              });
              resolve();
            });
        });
      });
    });

    context('С id в query', () => {
      it('Должен вернуть id, meta и structure', async () => {
        const targetScript = scripts[0];

        const token = await getToken('admin', 'admin');
        await new Promise((resolve) => {
          request.get('/scripts')
            .set('Authorization', `JWT ${token}`)
            .query({ id: targetScript.id })
            .end((err, res) => {
              expect(err).to.not.exist;
              res.should.have.status(200);
              res.body.should.be.a('object');
              res.body.should.have.all.keys('id', 'meta', 'structure');
              resolve();
            });
        });
      });

      it('Данные должны совпадать с тем, что в базе', async () => {
        const targetScript = scripts[0];

        const token = await getToken('admin', 'admin');
        await new Promise((resolve) => {
          request.get('/scripts')
            .set('Authorization', `JWT ${token}`)
            .query({ id: targetScript.id })
            .end((err, res) => {
              expect(err).to.not.exist;
              res.should.have.status(200);

              const { id, meta, structure } = targetScript;
              res.body.should.deep.equal({ id, meta, structure });
              resolve();
            });
        });
      });

      it('Данные должны совпадать с шаблоном', async () => {
        const scriptIndex = 1;

        const token = await getToken('admin', 'admin');
        await new Promise((resolve) => {
          request.get('/scripts')
            .set('Authorization', `JWT ${token}`)
            .query({ id: scripts[scriptIndex].id })
            .end((err, res) => {
              expect(err).to.not.exist;
              res.should.have.status(200);

              const { meta, structure } = res.body;
              scriptsTemplates[scriptIndex].should.deep.equal({ meta, structure });
              resolve();
            });
        });
      });
    });
  });

  context('Запрашивает администратор', () => {
    let account;
    // let admin;
    // let scripts;
    const scriptsTemplates = [{
      meta: { caption: 'Script 1' },
      structure: null,
    }, {
      meta: {
        description: 'Some archived script',
        nestedData: { foo: 'bar' },
      },
      destroyedAt: new Date(),
    }, {
      meta: { caption: 'Script 2' },
      structure: null,
    }, {
      meta: { caption: 'Archived script 1' },
      structure: null,
      destroyedAt: new Date(),
    }];

    before(async () => {
      await truncateModels('Account', 'User', 'Script');

      account = await db.Account.create({
        name: 'Test account',
      });
      await Promise.all([
        memory.create.user({
          role: 'admin',
          username: 'admin',
          password: 'admin',
          accountId: account.id,
        }),
        db.Script.bulkCreate(
          scriptsTemplates.map((temp) => ({
            ...temp,
            accountId: account.id,
          })),
        ),
      ]);
    });

    it('Должны вернуться все сценарии вне архива', async () => {
      const notArchivedTemplates = scriptsTemplates.filter(
        (temp) => !temp.destroyedAt,
      );

      const token = await getToken('admin', 'admin');
      await new Promise((resolve) => {
        request.get('/scripts')
          .set('Authorization', `JWT ${token}`)
          .end((err, res) => {
            expect(err).to.not.exist;
            res.should.have.status(200);
            res.body.should.be.a('array');
            res.body.length.should.equal(notArchivedTemplates.length);
            res.body.forEach((scr, index) => {
              expect(scr.meta).to.deep.equal(notArchivedTemplates[index].meta);
            });
            resolve();
          });
      });
    });

    it('Должны вернуться все сценарии в архиве', async () => {
      const archivedTemplates = scriptsTemplates.filter(
        (temp) => !!temp.destroyedAt,
      );

      const token = await getToken('admin', 'admin');
      await new Promise((resolve) => {
        request.get('/scripts')
          .set('Authorization', `JWT ${token}`)
          .query({ archived: 1 })
          .end((err, res) => {
            expect(err).to.not.exist;
            res.should.have.status(200);
            res.body.should.be.a('array');
            res.body.length.should.equal(archivedTemplates.length);
            res.body.forEach((scr, index) => {
              expect(scr.meta).to.deep.equal(archivedTemplates[index].meta);
            });
            resolve();
          });
      });
    });
  });

  context('Партнёрские сценарии', () => {
    let partnerAccount;
    let userAccount;
    let categories;
    let partnerScripts;
    let userScripts;

    before(async () => {
      await truncateModels('Account', 'User', 'Script');

      [partnerAccount, userAccount, categories] = await Promise.all([
        db.Account.create({ name: 'PartnerAccount', partner: true }),
        db.Account.create({ name: 'default' }),
        db.PartnerScriptCategory.bulkCreate([
          { name: 'Realty' },
          { name: 'Socks' },
          { name: 'Creators' },
        ]),
      ]);

      const partnerTemplates = [{
        meta: { some_meta_field: true },
        structure: { foo: 'bar' },
        public: true,
        partnerScriptCategoryId: null,
      }, {
        meta: { caption: 'Test caption' },
        structure: { fooless: 'barless', nodes: [1, 2, 3, 4, 5] },
        public: false,
        partnerScriptCategoryId: categories[0].id,
      }, {
        meta: null,
        structure: { flag: false },
        public: true,
        partnerScriptCategoryId: categories[2].id,
      }, {
        meta: null,
        structure: { info: 'structure of archived script' },
        destroyedAt: new Date(),
        public: true,
        partnerScriptCategoryId: categories[1].id,
      }];

      const userTemplates = [{
        meta: { yohoho: 'yeeeah' },
        structure: null,
        partnerScriptCategoryId: categories[1].id,
        public: false,
      }, {
        destroyedAt: new Date(),
      }];

      [partnerScripts, userScripts] = await Promise.all([
        db.Script.bulkCreate(
          partnerTemplates.map((template) => ({
            ...template,
            accountId: partnerAccount.id,
          })),
        ),
        db.Script.bulkCreate(
          userTemplates.map((template) => ({
            ...template,
            accountId: userAccount.id,
          })),
        ),
        memory.create.user({
          role: 'admin',
          username: 'partner',
          password: 'pass',
          accountId: partnerAccount.id,
        }),
        memory.create.user({
          role: 'admin',
          username: 'default',
          password: 'pass',
          accountId: userAccount.id,
        }),
      ]);
    });

    context('Запрашивает партнёр', () => {
      it('Возвращает поля public и partnerScriptCategoryId', async () => {
        const expectedScripts = partnerScripts.filter(({ destroyedAt }) => !destroyedAt);
        const token = await getToken('partner');

        const data = await new Promise((resolve) => {
          request.get('/scripts')
            .set('Authorization', `JWT ${token}`)
            .end((err, res) => {
              expect(err).to.not.exist;
              res.should.have.status(200);
              res.body.should.be.an('array');
              resolve(res.body);
            });
        });

        expect(data.length).to.equal(expectedScripts.length);
        data.forEach((item) => {
          expect(item).to.have.all.keys('id', 'meta', 'partnerScriptCategoryId', 'public');
        });
        expect(data).to.deep.equal(expectedScripts.map(
          ({
            id, meta, public: pub, partnerScriptCategoryId,
          }) => ({
            id, meta, public: pub, partnerScriptCategoryId,
          }),
        ));
      });

      it('Работает параметр archived', async () => {
        const expectedScripts = partnerScripts.filter(({ destroyedAt }) => !!destroyedAt);
        const token = await getToken('partner');

        const data = await new Promise((resolve) => {
          request.get('/scripts')
            .set('Authorization', `JWT ${token}`)
            .query({ archived: 1 })
            .end((err, res) => {
              expect(err).to.not.exist;
              res.should.have.status(200);
              res.body.should.be.an('array');
              resolve(res.body);
            });
        });

        expect(data.length).to.equal(expectedScripts.length);
        data.forEach((item) => {
          expect(item).to.have.all.keys('id', 'meta', 'partnerScriptCategoryId', 'public');
        });
        expect(data).to.deep.equal(expectedScripts.map(
          ({
            id, meta, public: pub, partnerScriptCategoryId,
          }) => ({
            id, meta, public: pub, partnerScriptCategoryId,
          }),
        ));
      });

      it('Работает параметр id', async () => {
        const script = partnerScripts[1];
        const token = await getToken('partner');

        const data = await new Promise((resolve) => {
          request.get('/scripts')
            .set('Authorization', `JWT ${token}`)
            .query({ id: script.id })
            .end((err, res) => {
              expect(err).to.not.exist;
              res.should.have.status(200);
              resolve(res.body);
            });
        });

        expect(data).to.be.an('object');
        expect(data).to.have.all.keys('id', 'meta', 'structure');
        const { id, meta, structure } = data;
        expect(script).to.deep.include({ id, meta, structure });
      });
    });

    context('Запрашивает админ, подписавшийся на сценарий партнёра', () => {
      before(async () => {
        await userAccount.addPartnerScripts(partnerScripts);
      });

      it('Возвращает дополнительно сценарии по подписке', async () => {
        const token = await getToken('default');

        const data = await new Promise((resolve) => {
          request.get('/scripts')
            .set('Authorization', `JWT ${token}`)
            .end((err, res) => {
              expect(err).to.not.exist;
              res.should.have.status(200);
              resolve(res.body);
            });
        });

        expect(data).to.be.an('array');
        expect(data).to.have.length(3);
        expect(data).to.have.deep.members([{
          id: userScripts[0].id,
          meta: userScripts[0].meta,
          partner: null,
          partnerScriptCategoryId: null,
        }, {
          id: partnerScripts[0].id,
          meta: partnerScripts[0].meta,
          partner: partnerAccount.name,
          partnerScriptCategoryId: partnerScripts[0].partnerScriptCategoryId,
        }, {
          id: partnerScripts[2].id,
          meta: partnerScripts[2].meta,
          partner: partnerAccount.name,
          partnerScriptCategoryId: partnerScripts[2].partnerScriptCategoryId,
        }]);
      });

      it('Ошибка, если просится доступ к сценарию партнёра по id (сценарий партнёра доступен)', async () => {
        const token = await getToken('default');
        await new Promise((resolve) => {
          request.get('/scripts')
            .set('Authorization', `JWT ${token}`)
            .query({ id: partnerScripts[0].id })
            .end((err, res) => {
              expect(err).to.not.exist;
              expect(res).to.have.status(404);
              expect(res.text).to.equal('script_not_found');
              resolve();
            });
        });
      });

      it('Возвращаются только сценарии аккаунта, если указан archived=1', async () => {
        const token = await getToken('default');

        const data = await new Promise((resolve) => {
          request.get('/scripts')
            .set('Authorization', `JWT ${token}`)
            .query({ archived: 1 })
            .end((err, res) => {
              expect(err).to.not.exist;
              res.should.have.status(200);
              resolve(res.body);
            });
        });

        expect(data).to.have.length(1);

        expect(data[0].id).to.equal(userScripts[1].id);
      });
    });
  });

  context('Видимость в группах и при архивации', () => {
    async function getScripts(role) {
      const token = await getToken(role, 'pass');

      return new Promise((resolve) => {
        request.get('/scripts')
          .set('Authorization', `JWT ${token}`)
          .end((err, res) => {
            expect(err).to.not.exist;
            res.should.have.status(200);
            res.body.should.be.an('array');
            resolve(res.body);
          });
      });
    }

    context('Запрашивает менеджер/студент вне групп', () => {
      let account;

      beforeEach(async () => {
        await truncateModels('Account', 'User', 'Script', 'Group');

        account = await db.Account.create({
          name: 'Test account',
        });
        await Promise.all([
          memory.create.user({
            role: 'manager',
            username: 'manager',
            password: 'pass',
            accountId: account.id,
          }),
          memory.create.user({
            role: 'student',
            username: 'student',
            password: 'pass',
            accountId: account.id,
          }),
        ]);
      });

      ['manager', 'student'].forEach((role) => {
        context(`Роль - ${role}`, () => {
          it('В аккаунте только сценарии вне групп', async () => {
            const scripts = await db.Script.bulkCreate(
              new Array(5).fill(0).map(() => ({
                accountId: account.id,
              })),
            );

            const resScripts = await getScripts(role);

            const resIds = resScripts.map(({ id }) => id);
            const scrIds = scripts.map(({ id }) => id);
            resIds.should.have.all.members(scrIds);
          });

          it('Некоторые сценарии в группах и не должны быть видны', async () => {
            const group = await db.Group.create({
              name: 'Some group',
              accountId: account.id,
            });
            const scripts = await db.Script.bulkCreate(
              new Array(4).fill(0).map(() => ({
                accountId: account.id,
              })),
            );
            const scriptsInGroups = [scripts[1], scripts[3]];
            await group.addScripts(scriptsInGroups);

            const resScripts = await getScripts(role);

            const resIds = resScripts.map(({ id }) => id);
            const outGroupsIds = scripts
              .filter((script) => !scriptsInGroups.includes(script))
              .map(({ id }) => id);
            resIds.should.have.all.members(outGroupsIds);
          });

          it('Некоторые сценарии архивированы и не должны вернуться', async () => {
            const scriptsCount = 10;
            const archivedScripts = new Set([0, 1, 3, 6, 8]);
            const scripts = await db.Script.bulkCreate(
              Array.from(new Array(scriptsCount), (val, index) => ({
                accountId: account.id,
                destroyedAt: archivedScripts.has(index) ? new Date() : null,
              })),
            );

            const resScripts = await getScripts(role);


            const expectIds = scripts
              .filter(({ destroyedAt }) => !destroyedAt)
              .map(({ id }) => id);
            const resIds = resScripts.map(({ id }) => id);
            resIds.should.have.all.members(expectIds);
          });
          context('Сценарии партнёра', () => {
            let partAcc;

            beforeEach(async () => {
              await truncateModels('AccountPartnerScript');

              partAcc = await db.Account.create({ name: 'partner', partner: true });
            });

            it('Один в группе аккаунта, другой вне (должен только второй вернуться)', async () => {
              const [scripts, group] = await Promise.all([
                db.Script.bulkCreate([
                  { accountId: partAcc.id, public: true },
                  { accountId: partAcc.id, public: true },
                ]),
                db.Group.create({ name: 'test', accountId: account.id }),
              ]);
              await group.addScript(scripts[1].id);
              await account.addPartnerScripts(scripts.map(({ id }) => id));

              const resScripts = await getScripts(role);

              const expectIds = [scripts[0].id];
              const resIds = resScripts.map(({ id }) => id);
              resIds.should.have.all.members(expectIds);
            });

            it('Сценарий вне групп, но не публичен', async () => {
              const [script] = await Promise.all([
                db.Script.create({ accountId: partAcc.id, public: false }),
              ]);
              await account.addPartnerScript(script.id);

              const resScripts = await getScripts(role);

              expect(resScripts).to.be.empty;
            });

            it('Сценарий вне групп, но в архиве', async () => {
              const [script] = await Promise.all([
                db.Script.create({ accountId: partAcc.id, public: true, destroyedAt: new Date() }),
              ]);
              await account.addPartnerScript(script.id);

              const resScripts = await getScripts(role);

              expect(resScripts).to.be.empty;
            });

            it('Партнёрский сценарий в группе другого аккаунта, должен вернуться', async () => {
              const anotherAcc = await db.Account.create({ name: 'another' });
              const [script, group] = await Promise.all([
                db.Script.create({ accountId: partAcc.id, public: true }),
                db.Group.create({ accountId: anotherAcc.id, name: 'teeest' }),
              ]);
              await Promise.all([
                account.addPartnerScript(script.id),
                anotherAcc.addPartnerScript(script.id),
                group.addScript(script),
              ]);

              const resScripts = await getScripts(role);

              expect(resScripts).to.not.be.empty;
              expect(resScripts.map(({ id }) => id)).to.deep.equal([script.id]);
            });
          });
        });
      });
    });

    context('Запрашивает менеджер/студент в группе', () => {
      let account;
      let group;

      beforeEach(async () => {
        await truncateModels('Account', 'User', 'Script', 'Group');

        account = await db.Account.create({
          name: 'Test account',
        });
        group = await db.Group.create({
          name: 'test group',
          accountId: account.id,
        });
        await Promise.all([
          memory.create.user({
            role: 'manager',
            username: 'manager',
            password: 'pass',
            accountId: account.id,
            groupId: group.id,
          }),
          memory.create.user({
            role: 'student',
            username: 'student',
            password: 'pass',
            accountId: account.id,
            groupId: group.id,
          }),
        ]);
      });

      // afterEach(async () => {
      //   await truncateModels('Script', 'Group', 'Course', 'CourseStep');
      // });

      ['manager', 'student'].forEach((role) => {
        context(`Роль - ${role}`, () => {
          it('В аккаунте сценарии в группе и вне, возвращаются только в', async () => {
            const scriptsCount = 10;
            const scripts = await db.Script.bulkCreate(
              new Array(scriptsCount).fill(0).map(() => ({ accountId: account.id })),
            );
            const scriptsInGroups = scripts.filter((val, index) => index % 3 === 0);
            await group.addScripts(scriptsInGroups);

            const resScripts = await getScripts(role);

            const resIds = resScripts.map(({ id }) => id);
            const expectIds = scriptsInGroups.map(({ id }) => id);
            resIds.should.have.all.members(expectIds);
          });
          it('В аккаунте две группы, возвращаются сценарии только из нужной', async () => {
            const scriptsCount = 10;
            const [scripts, secondGroup] = await Promise.all([
              db.Script.bulkCreate(
                new Array(scriptsCount).fill(0).map(() => ({ accountId: account.id })),
              ),
              db.Group.create({
                name: 'second group',
                accountId: account.id,
              }),
            ]);
            const scriptsInFirstGroup = scripts.filter((val, index) => index % 3 === 0);
            const scriptsInSecondGroup = scripts.filter((val, index) => index % 2 === 0);
            await Promise.all([
              group.addScripts(scriptsInFirstGroup),
              secondGroup.addScripts(scriptsInSecondGroup),
            ]);

            const resScripts = await getScripts(role);

            const resIds = resScripts.map(({ id }) => id);
            const expectIds = scriptsInFirstGroup.map(({ id }) => id);
            resIds.should.have.all.members(expectIds);
          });


          it('Сценарии лежат в группе, некоторые архивированы. Архивированные не должны быть видны', async () => {
            const [scripts] = await Promise.all([
              db.Script.bulkCreate(
                new Array(10).fill(0).map((val, index) => ({
                  accountId: account.id,
                  destroyedAt: index % 3 === 0 ? new Date() : null,
                })),
              ),
            ]);
            await Promise.all([
              group.addScripts(scripts),
            ]);

            const resScripts = await getScripts(role);

            const resIds = resScripts.map(({ id }) => id);
            const expectIds = scripts
              .filter(({ destroyedAt }) => !destroyedAt)
              .map(({ id }) => id);
            resIds.should.have.all.members(expectIds);
          });
          context('Сценарии партнёра', () => {
            let partAcc;

            beforeEach(async () => {
              await truncateModels('AccountPartnerScript');

              partAcc = await db.Account.create({ name: 'partner', partner: true });
            });

            it('Один в группе аккаунта, другой вне (должен только в группе вернуться)', async () => {
              const [scripts] = await Promise.all([
                db.Script.bulkCreate([
                  { accountId: partAcc.id, public: true },
                  { accountId: partAcc.id, public: true },
                ]),
              ]);
              await group.addScript(scripts[1].id);
              await account.addPartnerScripts(scripts.map(({ id }) => id));

              const resScripts = await getScripts(role);

              const expectIds = [scripts[1].id];
              const resIds = resScripts.map(({ id }) => id);
              resIds.should.have.all.members(expectIds);
            });

            it('Сценарий в группе, но не публичен', async () => {
              const [script] = await Promise.all([
                db.Script.create({ accountId: partAcc.id, public: false }),
              ]);
              await Promise.all([
                group.addScript(script.id),
                account.addPartnerScript(script.id),
              ]);

              const resScripts = await getScripts(role);

              expect(resScripts).to.be.empty;
            });

            it('Сценарий в группе, но в архиве', async () => {
              const [script] = await Promise.all([
                db.Script.create({ accountId: partAcc.id, public: true, destroyedAt: new Date() }),
              ]);
              await Promise.all([
                group.addScript(script.id),
                account.addPartnerScript(script.id),
              ]);

              const resScripts = await getScripts(role);

              expect(resScripts).to.be.empty;
            });
          });
        });
      });
    });
  });
});

async function getToken(username) {
  const user = await db.User.findOne({ where: { username } });
  const token = await memory.setSignJwt(user);
  return token;
}
