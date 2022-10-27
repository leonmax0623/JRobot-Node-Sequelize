const logger = require('intel').getLogger('structure-reader');
const comparing = require('./comparing');
const config = require('../../../config');
const {
  parseNodes,
  computeOptimalBranch,
  getCompareErrorReplica,
  getFaultReplica,
  openExpectationWords,
  hideExpectationWords,
} = require('./structure-reader-tools');

module.exports = class {
  /**
   * @typedef {{ branch: string, count: number, maxTrueHiddenWordsValue: number }} HistoryBranchItem
   * @typedef {string} HideWordsMode
   * может быть 'none', 'auto' и 'all'
   *
   * 'none' - ничего скрыто не будет
   *
   * 'auto' - автоматическое скрытие. Максимальный процент в истории для ветки + 10%
   *
   * 'all'  - скрывать всё
   *
   * @param {any} structure структура сценария, создаваемая в конструкторе.
   * @param {HistoryBranchItem[]} history история веток. В начале должны быть самые новые.
   * @param {{ examination: boolean, hideWordsMode: HideWordsMode }} options
   */
  constructor(structure, history = [], {
    hideWordsMode = 'none',
    loyality = 0.5,
    examination = false,
  }) {
    // Парсю узлы из структуры в оптимальный и удобный вид
    const [nodesMap] = parseNodes(structure.nodes);
    this._nodesMap = nodesMap;

    // Строю карту родитель-потомки
    const graph = new Map([...nodesMap].map(
      ([id, { children }]) => [id, children],
    ));

    // Рассчитываю ветку, по которой в этот раз будет происходить чтение
    const simpleHistory = history.map(({ branch }) => branch);
    this._branch = computeOptimalBranch(graph, simpleHistory, structure.root);

    // Теперь скрываю какие-то слова в узлах выбранной ветки, если нужно
    // Для начала нужно выбрать, какое количество скрывать
    let relativeHideCount = 0;
    if (examination || hideWordsMode === 'all') {
      relativeHideCount = 1;
    } else if (hideWordsMode === 'auto') {
      // Нужно найти ветку в истории.
      // Если она уже была, то её maxTrueHiddenWordsValue + 0.1
      // Если не была, то 0
      const joinedBranch = this.nodesBranch;
      const dataInHistory = history.find(({ branch }) => branch === joinedBranch);
      if (dataInHistory && dataInHistory.count >= 2) {
        relativeHideCount = dataInHistory.maxTrueHiddenWordsValue + 0.1;
      }
    }
    this._initialHiddenWordsValue = relativeHideCount;

    // Теперь активирую скрытие
    if (relativeHideCount > 0) {
      this._branch.forEach((nodeId) => {
        const { tokens } = (nodesMap.get(nodeId) || {}).expectation || {};

        if (tokens) {
          hideExpectationWords(tokens, relativeHideCount);
        }
      });
    }

    // Указатель на текущий узел в ветке. Индекс.
    this._current = -1;

    // Количество ошибок пользователя подряд
    this._faultsCount = 0;

    // Текущее ожидание ридера
    this._expectation = null;

    // Очередь речей, которые ридер будет отгружать
    this._speeches = [];

    // Флаг, показывающий, что последняя попытка пользователя - ошибка
    this._expectationFailed = false;

    // Статистика для подсчёта реального значения hiddenWordsValue
    this._stats = {
      tokensCount: 0,
      hiddenTokensCount: 0,
    };

    // Чувствительность
    this._loyality = loyality;

    // Первоначальный переход к первому узлу
    this._nextNode();
  }

  /**
   * Выбранная при данном чтении структуры ветка узлов
   */
  get nodesBranch() {
    return this._branch.join(' ');
  }

  /**
   * Реальное количество скрытых токенов
   */
  get realHiddenWordsValue() {
    return this._stats.tokensCount
      ? this._stats.hiddenTokensCount / this._stats.tokensCount
      : null;
  }

  /**
   * Исходное количество скрытых токенов
   */
  get initialHiddenWordsValue() {
    return this._initialHiddenWordsValue;
  }

  /**
   * Основная функция ридера. Возвращает очередную порцию данных. Это может быть:
   * - ошибка. Пользователь попытался удовлетворить подсказку, не вышло.
   * - речь. Ридер что-то говорит пользователю
   * - ожидание. Ридер что-то ждёт от пользователя
   * - окончание. Сценарий закончен
   *
   * @returns {{ type: string, text?: string, tokens?: string[] }}
   */
  next() {
    if (this._expectationFailed) {
      this._expectationFailed = false;
      return { type: 'fault' };
    }

    if (this._speeches.length) {
      return {
        type: 'speech',
        text: this._speeches.shift(),
      };
    }

    if (this._expectation) {
      return {
        type: 'expectation',
        tokens: this._expectation.tokens,
      };
    }

    return { type: 'done' };
  }

  /**
   * Функция, через которую пользователь пытается удовлетворить ожидания ридера.
   *
   * Просто принимает реплику и в зависимости от того, удачная она или нет, зависят дальнейшие
   * ответы из `next`
   *
   * @param {string} replica
   * @returns {Promise<void>}
   */
  async tryToSatisfyTheExpectation(replica) {
    if (!this._expectation) {
      throw new Error('User speaking not expected');
    }

    let isSimilar = false;

    try {
      // Обращаюсь к сервису сравнения через специальный модуль
      isSimilar = await comparing.isSimilar(
        this._expectation.source,
        replica,
        this._loyality,
        config.dialog.compareTimeout,
      );
    } catch (err) {
      logger.error(`Compare error occured. Expectation: "${this._expectation}", replica: "${replica}"`);
      this._speeches.push(getCompareErrorReplica());
      return;
    }

    if (!isSimilar) {
      // Если не похоже, подготавливаюсь
      // Отмечаю ошибку, увеличиваю кол-во ошибок, подготавливаю реплики для ошибки
      this._faultsCount += 1;
      this._expectationFailed = true;
      this._speeches = [getFaultReplica(this._faultsCount)];
      // И открываю 80% токенов в expectation
      openExpectationWords(this._expectation.tokens, 0.8);
    } else {
      // Запись в статистику итоговых данных скрытия
      for (const [, ...tokenOpts] of this._expectation.tokens) {
        if (!tokenOpts.includes('var')) {
          // Не учитываю в общем количестве переменные
          this._stats.tokensCount += 1;
        }
        if (tokenOpts.includes('hide')) {
          // Учитываю в скрытых
          this._stats.hiddenTokensCount += 1;
        }
      }

      this._expectation = null;
      this._faultsCount = 0;
      // Переход дальше
      this._nextNode();
    }
  }

  /**
   * Открываю токены в expectation
   */
  openExpectationWords() {
    // Если есть что-то кроме ожидания, ничего не делать
    if (
      !this._expectation
      || this._speeches.length
      || this._expectationFailed
    ) {
      return null;
    }

    openExpectationWords(this._expectation.tokens, 1);

    return {
      tokens: this._expectation.tokens,
    };
  }

  // private

  /**
   * Переход к следующему узлу в ветке
   */
  _nextNode() {
    this._current += 1;
    const node = this._currentNode;
    if (node) {
      // Если есть реплика, пушу
      if (node.speech) {
        this._speeches.push(node.speech);
      }

      if (node.expectation) {
        // Если есть ожидание, выставляю
        this._expectation = node.expectation;
      } else {
        // Иначе иду дальше
        this._nextNode();
      }
    }
  }

  /**
   * Текущий узел
   */
  get _currentNode() {
    return this._nodesMap.get(this._branch[this._current]);
  }

  /**
   * Ожидает ли ридер сейчас что-то
   */
  get _isExpectingForUserSpeech() {
    return (
      !this._expectationFailed
      && !this._speeches.length
      && !!this._expectation
    );
  }
};
