const chai = require('chai');
const sinon = require('sinon');
const axios = require('axios').default;

const tts = require('../../src/sockets/dialog-session/synthesis');
const audioApi = require('../../src/tools/audio-api');
const config = require('../../config');

const { expect } = chai;

describe('Кэширование синтезируемых реплик', () => {
  afterEach((done) => {
    sinon.restore();
    tts.clearData();
    done();
  });

  it('Кэширует при одинаковых параметрах', async () => {
    const buffer = new ArrayBuffer();
    const axiosStub = sinon.stub(axios, 'post').resolves({ data: buffer });
    const opts = {
      text: 'Hey!', emotion: 'evil', voice: 'zahar', speed: 1.42,
    };

    const first = await tts.get(opts);
    const second = await tts.get(opts);

    expect(first).to.deep.equal(second).and.to.deep.equal({
      original: buffer,
      speech: buffer,
    });
    expect(axiosStub.calledOnce).to.be.true;
  });
  it('Не кэширует, если разные эмоции', async () => {
    const buffers = [new ArrayBuffer(151), new ArrayBuffer(2523)];
    const axiosStub = sinon
      .stub(axios, 'post')
      .onFirstCall()
      .resolves({ data: buffers[0] })
      .onSecondCall()
      .resolves({ data: buffers[1] });

    const first = await tts.get({
      text: 'text', emotion: 'evil', speed: 152, voice: 'zahar',
    });
    const second = await tts.get({
      text: 'text', emotion: 'good', speed: 152, voice: 'zahar',
    });

    expect(first).to.deep.equal({
      speech: buffers[0],
      original: buffers[0],
    });
    expect(second).to.deep.equal({
      speech: buffers[1],
      original: buffers[1],
    });
    expect(axiosStub.calledTwice).to.be.true;
  });
  it('Не кэширует, если разные голоса', async () => {
    const buffers = [new ArrayBuffer(151), new ArrayBuffer(2523)];
    const axiosStub = sinon
      .stub(axios, 'post')
      .onFirstCall()
      .resolves({ data: buffers[0] })
      .onSecondCall()
      .resolves({ data: buffers[1] });

    const first = await tts.get({
      text: 'text', emotion: 'evil', speed: 152, voice: 'zahar',
    });
    const second = await tts.get({
      text: 'text', emotion: 'evil', speed: 152, voice: 'ermil',
    });

    expect(first).to.deep.equal({
      speech: buffers[0],
      original: buffers[0],
    });
    expect(second).to.deep.equal({
      speech: buffers[1],
      original: buffers[1],
    });
    expect(axiosStub.calledTwice).to.be.true;
  });
  it('Не кэширует, если разный темп речи', async () => {
    const buffers = [new ArrayBuffer(151), new ArrayBuffer(2523)];
    const axiosStub = sinon
      .stub(axios, 'post')
      .onFirstCall()
      .resolves({ data: buffers[0] })
      .onSecondCall()
      .resolves({ data: buffers[1] });

    const first = await tts.get({
      text: 'text', emotion: 'evil', speed: 152, voice: 'zahar',
    });
    const second = await tts.get({
      text: 'text', emotion: 'evil', speed: 2, voice: 'zahar',
    });

    expect(first).to.deep.equal({
      speech: buffers[0],
      original: buffers[0],
    });
    expect(second).to.deep.equal({
      speech: buffers[1],
      original: buffers[1],
    });
    expect(axiosStub.calledTwice).to.be.true;
  });
  it('Кэширует, если скорость равна до первого порядка', async () => {
    const buffer = new ArrayBuffer(151);
    const axiosStub = sinon
      .stub(axios, 'post')
      .onFirstCall()
      .resolves({ data: buffer });

    const first = await tts.get({
      text: 'text', emotion: 'evil', speed: 1.2951226, voice: 'zahar',
    });
    const second = await tts.get({
      text: 'text', emotion: 'evil', speed: 1.20000101023, voice: 'zahar',
    });

    expect(first).to.deep.equal({
      speech: buffer,
      original: buffer,
    }).and.to.deep.equal(second);
    expect(axiosStub.calledOnce).to.be.true;
  });
  it('Конвертирует уже закешированное, если отличается формат', async () => {
    const buffers = [new ArrayBuffer(41), new ArrayBuffer(512)];
    const axiosStub = sinon.stub(axios, 'post').resolves({ data: buffers[0] });
    const convertStub = sinon.stub(audioApi, 'convert').resolves(buffers[1]);
    const opts = {
      text: 'some text', emotion: 'evil', speed: 1, voice: 'zahar',
    };

    const clear = await tts.get(opts);
    const converted = await tts.get({ ...opts, format: '._.' });

    expect(clear).to.deep.equal({
      speech: buffers[0],
      original: buffers[0],
    });
    expect(converted).to.deep.equal({
      speech: buffers[1],
      original: buffers[0],
    });
    expect(axiosStub.calledOnce).to.be.true;
    expect(convertStub.calledOnceWith({
      data: buffers[0],
      from: 'opus',
      to: '._.',
    })).to.be.true;
  });
  it('Синтезирует и конвертирует, если отличается формат', async () => {
    const buffers = [new ArrayBuffer(41), new ArrayBuffer(512)];
    const axiosStub = sinon.stub(axios, 'post').resolves({ data: buffers[0] });
    const convertStub = sinon.stub(audioApi, 'convert').resolves(buffers[1]);

    const result = await tts.get({
      text: 'some text', emotion: 'evil', speed: 1, voice: 'zahar', format: 'mp3',
    });

    expect(result).to.deep.equal({
      speech: buffers[1],
      original: buffers[0],
    });
    expect(axiosStub.calledOnce).to.be.true;
    expect(convertStub.calledOnceWith({
      data: buffers[0],
      from: 'opus',
      to: 'mp3',
    })).to.be.true;
  });
  it('Выкидывает ошибку, если проблемы с axios', async () => {
    const err = new Error();
    sinon.stub(axios, 'post').rejects(err);

    try {
      await tts.get({ text: 'some text' });
      expect.fail('Error not thrown');
    } catch (e) {
      expect(e).to.equal(err);
    }
  });
  it('Выкидывает ошибку, если проблемы с корвертацией', async () => {
    const err = new Error();
    sinon.stub(axios, 'post').resolves({ data: null });
    sinon.stub(audioApi, 'convert').rejects(err);

    try {
      await tts.get({ text: 'some text', format: 'mp3' });
      expect.fail('Error not thrown');
    } catch (e) {
      expect(e).to.equal(err);
    }
  });
  it('Заново синтезирует, если разных запросов было больше, чем лимит в конфиге', async () => {
    const options = [
      { text: 'text 1', emotion: '1' },
      { text: 'text 2', emotion: '2' },
      { text: 'text 3', emotion: '3' },
    ];
    const buffers = new Array(4).fill(0).map(() => new ArrayBuffer());
    sinon.stub(config.ttsCaching, 'itemsLimit').value(2);
    const axStub = sinon.stub(axios, 'post');
    for (const i of [0, 1, 2, 3]) {
      axStub.onCall(i).resolves({ data: buffers[i] });
    }

    const results = [];
    results.push(await tts.get(options[0]));
    results.push(await tts.get(options[1]));
    results.push(await tts.get(options[2]));
    results.push(await tts.get(options[0]));

    expect(axStub.callCount).to.equal(4);
    expect(results).to.deep.equal(buffers.map((x) => ({
      speech: x,
      original: x,
    })));
  });
  it('Кэширует часто используемую реплику (проверка бамп-эффекта)', async () => {
    const options = [
      { text: 'text 1', emotion: '1' },
      { text: 'text 2', emotion: '2' },
      { text: 'text 3', emotion: '3' },
    ];
    const buffers = new Array(4).fill(0).map(() => new ArrayBuffer());
    sinon.stub(config.ttsCaching, 'itemsLimit').value(2);
    const axStub = sinon.stub(axios, 'post');
    for (const i of [0, 1, 2, 3]) {
      axStub.onCall(i).resolves({ data: buffers[i] });
    }

    const results = [];
    results.push(await tts.get(options[0]));
    results.push(await tts.get(options[1]));
    results.push(await tts.get(options[0]));
    results.push(await tts.get(options[2]));
    results.push(await tts.get(options[0]));
    results.push(await tts.get(options[1]));

    expect(axStub.callCount).to.equal(4);
    const resBuffers = [0, 1, 0, 2, 0, 3].map((val) => buffers[val]);
    expect(results).to.deep.equal(resBuffers.map((x) => ({
      speech: x,
      original: x,
    })));
  });
});
