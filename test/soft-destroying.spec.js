const chai = require('chai');
const chaiHTTP = require('chai-http');

chai.use(chaiHTTP);

const memory = require('../src/tools/memory');
const server = require('../src/app');

chai.should();
const { expect } = chai;
const { db } = memory;

let request;

describe('Script soft destroying', () => {
  let scriptId;
  let token;

  before(async () => {
    request = chai.request(server.listen(7000)).keepOpen();

    await db.sequelize.sync({ force: true });
    const acc = await memory.create.account('test');
    await memory.create.user({
      role: 'admin',
      username: 'test',
      password: 'pass',
      accountId: acc.id,
    });
    await new Promise((resolve) => {
      request.post('/auth-token')
        .send({
          username: 'test',
          password: 'pass',
        })
        .end((err, res) => {
          expect(err).to.not.exist;
          res.should.have.status(200);
          token = res.body.jwt;
          resolve();
        });
    });
  });

  beforeEach((done) => {
    request.put('/scripts')
      .set('Authorization', `JWT ${token}`)
      .send({
        meta: {},
        structure: {},
      })
      .end((err, res) => {
        expect(err).to.not.exist;
        res.should.have.status(201);
        res.body.should.have.property('id');
        const { id } = res.body;
        scriptId = id;
        done();
      });
  });

  after(async () => {
    request.close();
  });

  it('Should not return destoyed script', async () => {
    await new Promise((resolve) => {
      request.delete('/scripts')
        .set('Authorization', `JWT ${token}`)
        .query({ id: scriptId })
        .end((err, res) => {
          expect(err).to.not.exist;
          res.should.have.status(204);
          resolve();
        });
    });

    await new Promise((resolve) => {
      request.get('/scripts')
        .set('Authorization', `JWT ${token}`)
        .end((err, res) => {
          expect(err).to.not.exist;
          res.should.have.status(200);
          const scripts = res.body;
          scripts.map(({ id }) => id).should.not.include(scriptId);
          resolve();
        });
    });
  });
  it('Should return destoyed script when archived=1', async () => {
    await new Promise((resolve) => {
      request.delete('/scripts')
        .set('Authorization', `JWT ${token}`)
        .query({ id: scriptId })
        .end((err, res) => {
          expect(err).to.not.exist;
          res.should.have.status(204);
          resolve();
        });
    });

    await new Promise((resolve) => {
      request.get('/scripts')
        .set('Authorization', `JWT ${token}`)
        .query({
          archived: 1,
        })
        .end((err, res) => {
          expect(err).to.not.exist;
          res.should.have.status(200);
          const scripts = res.body;
          scripts.map(({ id }) => id).should.include(scriptId);
          resolve();
        });
    });
  });
  it('Should restore script', async () => {
    // prepare
    await new Promise((resolve) => {
      request.delete('/scripts')
        .set('Authorization', `JWT ${token}`)
        .query({ id: scriptId })
        .end((err, res) => {
          expect(err).to.not.exist;
          res.should.have.status(204);
          resolve();
        });
    });

    // action
    await new Promise((resolve) => {
      request.post('/restore-script')
        .set('Authorization', `JWT ${token}`)
        .query({ id: scriptId })
        .end((err, res) => {
          expect(err).to.not.exist;
          res.should.have.status(204);
          resolve();
        });
    });

    // check
    await new Promise((resolve) => {
      request.get('/scripts')
        .set('Authorization', `JWT ${token}`)
        .end((err, res) => {
          expect(err).to.not.exist;
          res.should.have.status(200);
          const scripts = res.body;
          scripts.map(({ id }) => id).should.include(scriptId);
          resolve();
        });
    });
  });
  it.skip('Should hide archived script from manager');
});
