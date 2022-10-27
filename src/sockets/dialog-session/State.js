const assert = require('assert');
const memory = require('../../tools/memory');
const db = require('../../../data/models');
const logger = require('intel').getLogger('session-manager');
const { convertToOggVorbis } = require('../../tools/audio-api');

/**
 * Сохранение реплик к сессии
 *
 * @typedef {{ data: Buffer, mimeType: string }} Record
 * @param {number} sessionId - id сессии
 * @param {{ text: string, author: string, record: Record }[]} replicas список реплик
 */
async function saveReplicas(sessionId, replicas) {
  // Здесь основная задача в том, чтобы преобразовать все реплики к одному формату - audio/ogg
  const items = await Promise.all(await replicas.map(
    async (replica) => {
      const item = {
        ...replica,
        sessionId,
      };
      const { record } = replica;
      if (record && record.data) {
        try {
          const { mimeType, data } = record;
          await convertToOggVorbis(data, mimeType).then( record => {
            item.record = record;
          });
        } catch (e) {
          logger.debug('convert problem', e);
        }
      }
      return item;
    },
  ));
  // Сохраняю результат
  try {
    await db.Replica.bulkCreate(items);
  } catch (e) {
    console.error({ 'saveReplicas': e });
  }
}

/**
 * Данный класс занимается сохранением данных сессии и её реплик в БД.
 */
module.exports = class {
  constructor() {
    // this._userId = userId;
    // this._accountId = accountId;

    // Здесь все данные самой сессии, модель Session
    this._sessionData = null;
    // Здесь реплики сессии
    this._notes = [];
    // Время, в которое сессия была начата
    this._startedAt = null;
    // Время, в которое сессия была приостановлена
    this._pausedAt = null;
  }

  /**
   * Результаты сессии, статистика. Длительность, количество ошибок, скрытие слов
   *
   * ВАЖНО: Перед тем, как получать результаты, сессию нужно остановить через stop()
   */
  getResults() {
    if (this.isStarted) {
      throw new Error('Session not stopped');
    }
    if (this._sessionData) {
      const { duration, faults, trueHiddenWordsValue, recognitionType } = this._sessionData;
      return { duration, faults, trueHiddenWordsValue, recognitionType };
    }
    return null;
  }

  /**
   * Запущена ли
   */
  get isStarted() {
    return !!this._startedAt;
  }

  /**
   * Приостановлена ли
   */
  get isPaused() {
    return !!this._pausedAt;
  }

  /**
   * Открыта ли (Был ли вызван open())
   */
  get isOpened() {
    return !!this._sessionData;
  }

  /**
   * Экзаменационная ли сессия
   */
  get isExamination() {
    return this._sessionData && this._sessionData.examination;
  }

  /**
   * Записывать сессию
   */
  get isSaveRecord() {
    return this._sessionData && this._sessionData.saveRecords;
  }

  /**
   * Открытие сессии, инициализация данных
   */
  async open({
    userId,
    accountId,
    scriptId,
    examination = false,
    saveRecords = false,
    gender = false,
    emotion = false,
    speed = false,
  }) {
    if (this._sessionData) {
      throw new Error('Already opened');
      // await this.close(false);
    }

    assert(userId, new Error('No userId'));
    assert(accountId, new Error('No accountId'));

    const data = {
      userId,
      accountId,
      scriptId,
      examination,
      saveRecords,
      gender,
      emotion,
      speed,
      duration: 0,
      faults: 0,
      success: false,
      nodesBranch: null,
      trueHiddenWordsValue: null,
    };

    // Task 5020 save settings for the user
    const user = await db.User.findOne({
      where: {
        id: userId,
      },
    });

    if (user) {
      const { params } = user;
      params.gender = gender;
      params.emotion = emotion;
      params.speed = speed;

      await memory.update.user(
          user,
          { params },
          false,
      );
    }

    // if (process.env.NODE_ENV === 'development') {
    //   /* eslint-disable-next-line no-console */
    //   console.log('Opening session data:', data);
    // }

    this._sessionData = data;
    this._notes = [];
    this._results = null;
    this._startedAt = null;
  }

  /**
   * Отметка начала сессии
   */
  start() {
    this._startedAt = Date.now();
  }

  /**
   * Полная остановка сессии и расчёт её времени
   */
  stop() {
    if (this._sessionData) {
      // Если она приостановлена, то продолжу для корректного учёта времени
      if (this.isPaused) {
        this.resume();
      }
      if (this._startedAt) {
        this._sessionData.duration += Date.now() - this._startedAt;
        // Если вдруг оказалось отричательным (баг?), то выравниваю
        this._sessionData.duration = Math.max(0, this._sessionData.duration);
        this._startedAt = null;
      }
    }
  }

  /**
   * Закрытие сессии
   *
   * - `storeReplicasRecords` - сохранять ли записи
   */
  // eslint-disable-next-line
  async close({ storeReplicasRecords = false } = {}) {
    if (this._sessionData) {
      if (this.isStarted) {
        this.stop();
      }
      if (process.env.NODE_ENV !== 'production') {
      }
      const session = await db.Session.create(this._sessionData);
  
      await memory.decreaseAccountTimeLeft(
          this._sessionData.accountId,
          this._sessionData.duration,
      );
      await saveReplicas(
          session.id,
          this._notes
      );

      this._sessionData = null;

      return session.id;
    }

    return null;
  }

  /**
   * Фиксация реплики сессии
   *
   * @param {string} author - user или bot
   * @param {string} text - что было сказано
   * @param {string} recognitionType - тип распознавания
   * @param {{ data: Buffer, mimeType: string }?} record - (опционально) запись сессии, данные
   */
  commitReplica(author, text, record = null, recognitionType) {
    this._notes.push({ author, text, record, recognitionType });
  }

  /**
   * Приостановка сессии
   */
  pause() {
    if (this._sessionData && (!this.isExamination || !this.isSaveRecord)) {
      if (!this.isPaused) {
        this._pausedAt = Date.now();
      }
      // Сессия приостановлена (или и так была)
      return true;
    }
    // Не приостановлена
    return false;
  }

  /**
   * Продолжение сессии
   */
  resume() {
    if (this._sessionData && this._pausedAt) {
      // Убавляю от длительности время паузы
      this._sessionData.duration -= Date.now() - this._pausedAt;
      this._pausedAt = null;
      // Продолжена
      return true;
    }
    // Не продолжена
    return false;
  }

  /**
   * Фиксация ошибки
   */
  fault() {
    if (this._sessionData) {
      this._sessionData.faults += 1;
    }
  }

  /**
   * Фиксация успешного завершения сессии
   *
   * - `nodesBranch` - ветка, по которой занимался пользователь
   *
   * - `trueHiddenWordsValue` - относительное количество скрытых слов
   */
  doneSuccess({
    nodesBranch = null,
    trueHiddenWordsValue = null,
  }) {
    if (this._sessionData) {
      this._sessionData = {
        ...this._sessionData,
        success: true,
        nodesBranch,
        trueHiddenWordsValue,
      };
    }
  }
};
