const assert = require('assert');
const Sentry = require('@sentry/node');
// const strftime = require('strftime');

const logger = require('intel').getLogger('dialog-session');

// Этот модуль занимается синтезом
const synthesis = require('./dialog-session/synthesis');
const memory = require('../tools/memory');
const { verify } = require('./auth');

// Этот класс занимается парсингом и чтением структуры сценария
const ScriptStructureReader = require('./dialog-session/StructureReader');
const { choice: randomChoice } = require('../tools/random');

// Этот класс занимается учётом состояния сессии и её сохранением в БД
const SessionState = require('./dialog-session/State');
const config = require('../../config');

// Класс, используемый для автопаузы сессии через
// определённый промежуток времени неактивности пользователя
const Timer = require('./dialog-session/Timer');

// Отсюда будет зацеплен хук, что сценарий начат пользователем
const amoHooks = require('../amoCRM/hooks');

module.exports = class {
  /**
   * @param {SocketIO.Socket} socket
   */
  constructor(socket) {
    // Сокет
    this._socket = socket;
    // Таймер автопаузы в случае неактивности
    this._autopauseTimer = new Timer(
      () => {
        if (this._state && this._state.isExamination) {
          this._socket.emit('fail', 'Inactivity while examinating');
          // this._socket.disconnect();
        } else {
          this.pause();
        }
      },
      config.dialog.autopauseDelay,
      false,
    );
  }

  async setup() {
    const socket = this._socket;
    // let user;

    this._logInfo('Session setup initiated');

    // Парсинг токена и нахождение подключаемого пользователя
    try {
      const { token } = socket.handshake.query;
      this._user = await verify(token);
      this._logInfo('userId:', this._user.id);
    } catch (err) {
      this._logInfo(`Authorization error: "${err.message}"`);
      throw new Error(`Authorization error: "${err.message}"`);
    }

    // Проверка активности аккаунта пользователя
    if (!await memory.isAccountActive(this._user.accountId)) {
      this._logInfo('Session setup failed, account inactive');
      throw new Error('Account inactive');
    }

    // Проверка scriptId и взятие script
    const scriptId = +socket.handshake.query.scriptId;
    this._logInfo('scriptId:', scriptId);
    const [script] = await memory.select(`
      select "Scripts".id, structure
      from "Scripts" join "Accounts" on "Accounts".id = "Scripts"."accountId"
      where
        "Scripts".id = ${scriptId}
        and (
          "Accounts".id = ${this._user.accountId}
          or "Accounts".partner
        )
    `);
    assert(script, new Error('Script not found'));

    const examination = socket.handshake.query.examination === 'true';
    const hideWordsMode = socket.handshake.query.hideWordsMode || 'none';
    const loyality = socket.handshake.query.loyality || 0.5;
    const saveRecords = socket.handshake.query.saveRecords === 'true';
    const { gender } = socket.handshake.query;
    const { emotion } = socket.handshake.query;
    const { speed } = socket.handshake.query;
    this._logInfo(`Examination: ${examination} | hideWordsMode: ${hideWordsMode} | loyality: ${loyality} | saveRecords: ${saveRecords} | gender: ${gender} | emotion: ${emotion} | speed : ${speed}`);

    if (hideWordsMode) {
      const data = { params: this._user.params };
      if (data.params === null) {
        data.params = {};
      }
      data.params.hideWordsMode = hideWordsMode;
      await memory.update.user(this._user, data, true);
    }

    // Инициализация ридера
    const userHistory = await getUserHistory(this._user.id, scriptId);
    this._reader = new ScriptStructureReader(script.structure, userHistory, {
      hideWordsMode,
      loyality,
      examination,
    });

    // Инициализация состояния
    this._state = new SessionState();
    this._state.open({
      userId: this._user.id,
      accountId: this._user.accountId,
      scriptId,
      examination,
      saveRecords,
      gender,
      emotion,
      speed,
    });

    const account = await memory.db.Account.findByPk(this._user.accountId);
    this._textToSpeechOptions = {};
    if (speed !== 'false') {
      this._textToSpeechOptions.speed = parseFloat(speed);
    } else {
      const minimum = 0.75;
      const maximum = 1.4;
      this._textToSpeechOptions.speed = minimum + Math.random() * (maximum - minimum);
    }

    if (emotion !== 'false' && emotion !== 'off') {
      this._textToSpeechOptions.emotion = emotion;
      this._textToSpeechOptions.voice = randomChoice(['jane', 'omazh']);
    }

    const isPremiumVoice = account.params.premium_voices || false;
    if (isPremiumVoice) {
      switch (gender) {
        case 'female':
          this._textToSpeechOptions.voice = 'alena';
          break;
        case 'male':
          this._textToSpeechOptions.voice = 'filipp';
          break;
        default:
          this._textToSpeechOptions.voice = randomChoice(['alena', 'filipp']);
          break;
      }
    } else if (emotion === 'false' || emotion === 'off') {
      switch (gender) {
        case 'female':
          this._textToSpeechOptions.voice = randomChoice(['oksana', 'jane', 'omazh']);
          break;
        case 'male':
          this._textToSpeechOptions.voice = randomChoice(['ermil', 'zahar']);
          break;
        default:
          this._textToSpeechOptions.voice = randomChoice(['oksana', 'jane', 'omazh', 'ermil', 'zahar']);
          break;
      }
    }

    // События сокета
    socket.on('disconnect', this.socketDisconnect.bind(this));
    socket.on('next', this.socketNext.bind(this));
    socket.on('pause', this.pause.bind(this));
    socket.on('resume', this.resume.bind(this));
    socket.on('show-the-expectation', this.showTheExpectation.bind(this));

    // Сообщаю amoCRM, что сценарий запущен
    await amoHooks.scriptStarted(this._user);

    // Всё готово для того, чтобы проводить сессию
    this._logInfo('Session setup done successfull');
  }

  async socketDisconnect() {
    try {
      // Очищаю таймер
      this._autopauseTimer.clear();
      if (this._state) {
        // Закрываю сессию
        // Успешна она или нет зависит от того, был ли получен из ридера null
        await this._closeSession();

        this._logInfo('Disconnect');
      } else {
        this._logInfo('Disconnect without session state');
      }
    } catch (err) {
      this._logError('socket.disconnect error.', err);
      this._sentryCapture(err);
    }
  }

  async socketNext(data, ack) {
    // Замеряю время
    const start = Date.now();
    try {
      // Переустанавливаю таймер, так как проявилась активность пользователя
      this._autopauseTimer.set();

      if (!this._state.isStarted) {
        // Если сессия не начата (не начат отсчёт времени), то начинаю
        this._state.start();
      }
      if (this._state.isPaused) {
        // Если вдруг была пауза, то продолжаю
        this.resume();
      }

      if (data && data.speech) {
        // Если пользователь прислал свою речь,
        // то направить её в ридер и сохранить в состоянии
        const { text, record, recognitionType } = data.speech;
        this._state.commitReplica('user', text, record, recognitionType);
        await this._reader.tryToSatisfyTheExpectation(text);
      }
      // Извлекаю информацию для пользователя
      const next = await this._next();
      // И возвращаю в сокет
      ack(next);
    } catch (err) {
      this._logError('NEXT event handling error:', err);
      this._sentryCapture(err);
      // Уведомляю, что произошла авария
      this._socket.emit('issue');
    } finally {
      // Лог того, сколько времени занял ответ пользователю
      this._logInfo(`next (${Date.now() - start}ms)`);
    }
  }

  pause() {
    try {
      if (!this._state.isExamination && this._state.pause()) {
        // Если не экзамен и сессия остановилась, уведомляю пользователя и чищу таймер
        this._socket.emit('paused');
        this._autopauseTimer.clear();
      }
    } catch (err) {
      this._logError('socket.pause error.', err);
      this._sentryCapture(err);
    }
  }

  resume() {
    try {
      if (this._state.resume()) {
        // Если сессия остановилась, уведовляю и устанавливаю таймер
        this._socket.emit('resumed');
        this._autopauseTimer.set();
      }
    } catch (err) {
      this._logError('socket.resume error.', err);
      this._sentryCapture(err);
    }
  }

  showTheExpectation() {
    // Пользователь запросил показать скрытые слова.
    // Этот метод используется при нажатии на глазок
    // в постепенном прохождении на фронте
    try {
      // Получаю обновлённые токены expectation
      const { tokens } = this._reader.openExpectationWords();
      // Отправляю пользователю
      this._socket.emit('update-the-expectation', { tokens });
    } catch (err) {
      this._logError('socket.show-the-expectation error.', err);
      this._sentryCapture(err);
    }
  }

  /**
   * fault | speech | expectation | null(done) | Error
   * @typedef {Object} SessionNext
   * @property {String} type - 'fault', 'speech', 'expectation', 'done'
   * @property {String} text - Если 'speech' или 'expectation'
   * @property {Buffer} audio - Если есть синтез 'speech'
   * @property {Boolean} synthesisFailed - если была попытка синтеза, но это было неудачно
   * @property {{ duration: number, faults: number }} results - Если 'done'
   * @returns {Promise<SessionNext>}
   */
  async _next() {
    // Извлекаю данные из ридера
    const next = this._reader.next();

    if (next.type === 'fault') {
      // Если там ошибка, учитываю в состоянии
      this._state.fault();
    } else if (next.type === 'speech') {
      // Если речь, то синтезирую её текст
      const { text } = next;

      next.audio = null;
      next.synthesisFailed = false;
      let recordToSave = null;

      try {
        // Опции синтеза
        const ttsOptions = {
          text,
          ...this._textToSpeechOptions,
        };
        // Формат синтеза. На iOS/Safari не воспроизводится ogg, который даёт Яндекс.
        const { synthesFormat: format } = this._socket.handshake.query;
        if (format && format !== 'opus') {
          ttsOptions.format = format;
        }

        // Синтезирую. speech - запрашиваемый формат, original - ogg.
        // Сохраняется original, отправляется пользователю speech
        const { speech, original } = await synthesis.get(ttsOptions);

        next.audio = speech;
        recordToSave = {
          data: original,
          mimeType: 'audio/ogg',
        };
      } catch (err) {
        logger.error(err);
        // Ставлю флажок, что синтез не удался :(
        next.synthesisFailed = true;
      }

      // Фиксирую реплику
      this._state.commitReplica('bot', text, recordToSave, 'bot');
    } else if (next.type === 'done') {
      // Ридер дочитал до конца. Останавливаю сессию
      this._state.stop();
      // И отмечаю, что она завершена успешно
      this._state.doneSuccess({
        // Была такая ветка
        nodesBranch: this._reader.nodesBranch,
        // И было такое скрытие слов
        trueHiddenWordsValue: this._reader.realHiddenWordsValue,
      });

      // Беру результаты сессии перед её закрытием
      const results = this._state.getResults();

      // Теперь закрываю сессию, чтобы когда пользователь
      // после закрытия тренажёра обновил статистику,
      // у него гарантированно она будет актуальной.
      // await this._closeSession();

      return {
        type: 'done',
        // Даю пользователю его результаты
        results,
      };
    }

    return next;
  }

  /**
   * Закрытие сессии. Если она уже закрыта, ничего не делает
   */
  async _closeSession() {
    if (this._state && this._state.isOpened) {
      // eslint-disable-next-line no-useless-concat
      this._logInfo(`${'Session closed' + 'storeReplicasRecords: ('}${
        this._reader.initialHiddenWordsValue}` > config.dialog.recordsSavingHideValue
          || this._reader.realHiddenWordsValue > config.dialog.recordsSavingHideValue
          || `${this._state.isSaveRecord
          })`);
      const sessionId = await this._state.close({
        // Сохраняю запись сессии тогда, когда
        // исходное скрытие слов сессии
        // или реальное скрытие
        // больше, чем значение в конфиге
        storeReplicasRecords: (
          this._reader.initialHiddenWordsValue > config.dialog.recordsSavingHideValue
          || this._reader.realHiddenWordsValue > config.dialog.recordsSavingHideValue
          || this._state.isSaveRecord
        ),
      });
      this._logInfo(`Session closed. sessionId: ${sessionId}`);
    }
  }

  _logInfo(...args) {
    logger.info(this._socket.id, ...args);
  }

  _logError(...args) {
    logger.debug(this._socket.id, ...args);
  }

  // Отправка данных об ошибке в Sentry
  _sentryCapture(err) {
    Sentry.configureScope((scope) => {
      scope.setExtra('socket.handshake.query', this._socket.handshake.query);
      scope.setExtra('socket.handshake.headers', this._socket.handshake.headers);
      scope.setExtra('socket.handshake.address', this._socket.handshake.address);
      scope.setExtra('socket.id', this._socket.id);

      if (this._user) {
        scope.setUser({
          username: this._user.username,
          id: this._user.id,
          email: this._user.username,
        });
      }

      if (this._state) {
        scope.setExtra('sessionData', this._state._sessionData);
      }

      Sentry.captureException(err);
    });
  }
};

/**
 * Берёт историю пользователя из базы для работы "умного ветвления" в ридере
 * и для корректного скрытия слов в зависимости от конкретной ветки
 *
 * ВАЖНО: Обратите внимание, что сессия сохраняется всегда при отключении сокета. НО
 * nodesBranch сохраняется в сессии только тогда, когда она завершена успешно. Это значит,
 * что здесь не учитывается история не завершённых до конца сессий.
 *
 * @typedef {{ branch: string, count: number, maxTrueHiddenWordsValue: number }} HistoryRow
 * @param {string|number} userId
 * @param {string|number} scriptId
 * @returns {Promise<HistoryRow[]>}
 */
function getUserHistory(userId, scriptId) {
  return memory.select(`
    select
      "nodesBranch" branch,
      count(*) count,
      coalesce(max("trueHiddenWordsValue"), 0) "maxTrueHiddenWordsValue"
    from
      "Sessions"
    where
      "userId" = ${userId} and
      "scriptId" = ${scriptId} and
      "nodesBranch" is not null
    group by
      "nodesBranch"
    order by
      max("createdAt") desc
  `);
}
