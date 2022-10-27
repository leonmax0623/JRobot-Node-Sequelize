const sinon = require('sinon');
const chai = require('chai');
const jwt = require('jsonwebtoken');
const timekeeper = require('timekeeper');
const memory = require('../src/tools/memory');
const config = require('../config');

const { expect } = chai;

describe('memory.setSignJwt', () => {
  afterEach((done) => {
    sinon.restore();
    timekeeper.reset();
    done();
  });

  it('Обновляется jwtIat у пользователя', async () => {
    const now = Date.now();
    timekeeper.freeze(now);
    const uid = 5152;
    const user = {
      id: uid,
      dataValues: { id: uid },
      update() {},
    };
    const stub = sinon.stub(user, 'update');
    stub.resolves();

    await memory.setSignJwt(user);

    expect(stub.calledOnce).to.be.true;
    expect(stub.firstCall.calledWith({ jwtIat: now })).to.be.true;
  });

  it('jwt корректный', async () => {
    const now = Date.now();
    timekeeper.freeze(now);
    const uid = 5152;
    const user = {
      id: uid,
      dataValues: { id: uid },
      update() {},
    };

    const token = await memory.setSignJwt(user);

    expect(token).to.exist;
    expect(token).to.equal(jwt.sign(
      { uid, iat: now },
      config.app.secret,
    ));
  });
});
