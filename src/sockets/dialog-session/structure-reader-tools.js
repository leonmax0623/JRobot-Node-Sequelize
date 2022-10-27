/* eslint-disable no-continue */

const randomChoice = require('../../tools/random').choice;
const i18n = require('../../tools/i18n');
const matchAll = require('string.prototype.matchall');

const REGEXP_VARS = /{([.\wа-яё]+)}/gi;
const REGEXP_KEYWORDS = /\[(.+?)\]/gi;
// eslint-disable-next-line
const REGEXP_SPACE = /\s+/;

/**
 * Парсит узлы из структуры сценария, заодно делая подстановку переменных
 *
 * @typedef {{ replica: string, action: { to: (string|string[]) } }} RawNodeExpected
 * @typedef {{ id: string, replicas: string[], expected: RawNodeExpected[] }} RawNode
 *
 * @typedef {string[]} ExpectationToken - формат: [tokenText, ...params]. Params - 'var|hide|bold'
 * @typedef {{
 * id: string,
 * speech?: string,
 * expectation?: { source: string, tokens: ExpectationToken[] },
 * children?: string[]
 * }} Node
 * @param {Array<RawNode>} rawNodes узлы в сыром виде, как хранятся в структуре сценария
 * @returns {[Map<string, Node>, Map<string, string>]} Карта узлов и карта переменных соответственно
 */
function parseNodes(rawNodes) {
  // Карта переменных, которые будут подставляться по мере нахождения
  const varsMap = new Map();

  /**
   * Узлы, которые будут результатом парсинга
   * @type {Map<string, Node>}
   */
  const nodes = new Map(rawNodes.map((rawNode) => {
    /** @type {Node} */
    const node = {
      id: rawNode.id,
      speech: null,
      expectation: null,
      children: null,
    };

    // Выбираю speech
    {
      const replicas = rawNode.replicas.filter((v) => !!v);
      if (replicas.length) {
        // Выбираю одну рандомную из нескольких, заодно делая подстановку переменных
        node.speech = parseSpeech(randomChoice(replicas), varsMap);
      }
    }

    // Ожидание и потомки
    if (rawNode.expected && rawNode.expected.length) {
      const [{ replica, action }] = rawNode.expected;

      // Expectation
      if (replica && typeof replica === 'string') {
        // Парсю expectation - то, что должен говорить пользователь
        node.expectation = parseExpectation(replica, varsMap);
      }

      // Children - потомки, куда дальше возможен переход с этого узла
      if (action && action.to) {
        if (Array.isArray(action.to) && action.to.length) {
          node.children = action.to;
        } else if (typeof action.to === 'string') {
          node.children = [action.to];
        }
      }
    }

    return [node.id, node];
  }));

  // Возвращаю узлы и карту переменных (она не используется, правда)
  return [nodes, varsMap];
}

/**
 * Подменяет в speech-реплике переменные.
 *
 * @param {string} text сама реплика
 * @param {Map<string, string>} varsMap карта переменных (затрагивается внутри)
 * @returns {string}
 */
function parseSpeech(text, varsMap) {
  return replaceWithVars(text, varsMap);
}

/**
 * Парсит expectation на ExpectationToken'ы
 * Токены здесь - единицы текста, разделённые пробелами
 *
 * @param {string} text реплика
 * @param {*} varsMap карта переменных (затрагивается внутри)
 * @returns {{ source: string, tokens: ExpectationToken[]}}
 *
 * - source - исходная реплика с перемеными подставленными
 * - tokens - токены c параметрами
 */
function parseExpectation(text, varsMap) {
  let tokens = [];

  // Делаю первый парсинг с выделением слов в ключевых выражениях
  // note: ключевое выражение - это слова, заключённые в квадратные скобки
  // Пример: 'Кто [вы такой вообще], а?'
  // В итоге получится { test: string, bold?: boolean }[]
  {
    /** @type {Iterator<>} */
    const keywords = matchAll(text, REGEXP_KEYWORDS);
    let nextMatch = null;
    let last = 0;
    do {
      nextMatch = keywords.next();
      const nextIndex = nextMatch.done ? text.length : nextMatch.value.index;
      const normalText = text.slice(last, nextIndex);
      tokens.push({ text: normalText });
      /*
      tokens.push(
        ...normalText
          .split(REGEXP_SPACE)
          .filter((v) => !!v)
          .map((v) => ({ text: v })),
      );
      */

      if (!nextMatch.done) {
        const { 0: orig, 1: key, index } = nextMatch.value;
        last = index + orig.length;
        tokens.push({ text: key, bold: true });
        /*
        tokens.push(
          ...key
            .split(REGEXP_SPACE)
            .filter((v) => !!v)
            .map((v) => ({ text: v, bold: true })),
        );
        */
      }
    } while (!nextMatch.done);
  }

  // Теперь подменяю переменные
  for (let i = 0; i < tokens.length; i += 1) {
    const { [i]: token } = tokens;

    if (REGEXP_VARS.test(token.text)) {
      token.text = replaceWithVars(token.text, varsMap);
      token.var = true;
    }
  }

  // Сжимаю, удаляю лишнее, делаю массивом
  tokens = tokens.map((token) => {
    const res = [token.text];
    // if (token.hide) {
    //   res.push('hide');
    // }
    if (token.bold) {
      res.push('bold');
    }
    if (token.var) {
      res.push('var');
    }
    return res;
  });

  return {
    source: replaceWithVars(text, varsMap),
    tokens,
  };
}

/**
 * Скрывает заданное относительное количество токенов
 * то есть хитрым образом добавляет некоторым токенам параметр 'hide'.
 *
 * Не затрагивает токены переменных ('var')
 *
 * @param {ExpectationToken[]} tokens массив токенов, с которыми будут манипуляции
 * @param {number} relativeCount относительное количество того, что будет скрыто
 */
function hideExpectationWords(tokens, relativeCount) {
  if (relativeCount > 0) {
    if (relativeCount >= 1) {
      // Всем токенам, которые не имеют var, добавляю hide
      for (let i = 0; i < tokens.length; i += 1) {
        const props = new Set(tokens[i].slice(1));
        if (!props.has('var')) {
          props.add('hide');
        }
        tokens[i] = [tokens[i][0], ...props];
      }
    } else {
      /**
       * Список доступных токенов (их индексов), которые можно скрыть
       * @type {Array<number>}
       */
      const availableIndexes = tokens.reduce((prev, val, index) => {
        const props = new Set(val.slice(1));
        if (!props.has('var') && !props.has('hide')) {
          prev.push(index);
        }

        return prev;
      }, []);

      // Количество токенов, которые я буду скрывать
      const hideCount = Math.ceil(availableIndexes.length * relativeCount);

      // Теперь рандомно скрываю те или иные токены из доступных
      const hided = new Set();
      while (hided.size < hideCount) {
        const index = ~~(Math.random() * availableIndexes.length);
        if (!hided.has(index)) {
          hided.add(index);
          tokens[index].push('hide');
        }
      }
    }
  }
}

/**
 * Умным образом убирает из каких-то токенов
 * параметр 'hide'
 *
 * @param {ExpectationToken[]} tokens
 * @param {number} relativeCount Относительное количество того, что будет открыто
 */
function openExpectationWords(tokens, relativeCount = 0.3) {
  const hidedIndexes = tokens.reduce((prev, [, ...style], index) => {
    if (style.includes('hide')) {
      prev.push(index);
    }
    return prev;
  }, []);

  if (hidedIndexes.length) {
    let count = Math.min(hidedIndexes.length, Math.ceil(hidedIndexes.length * relativeCount));
    const shown = new Set();
    while (count > 0) {
      const index = hidedIndexes[~~(Math.random() * hidedIndexes.length)];
      if (!shown.has(index)) {
        shown.add(index);
        count -= 1;
        tokens[index] = tokens[index].filter((v) => v !== 'hide');
      }
    }
  }
}

/**
 * Подменяет переменные в строке. Новые найденные переменные записываются в varsMap
 *
 * @param {string} replica
 * @param {Map<string, string>} varsMap
 */
function replaceWithVars(replica, varsMap) {
  return replica.replace(REGEXP_VARS, (match, varName) => {
    if (!varsMap.has(varName)) {
      varsMap.set(varName, getVarValue(varName));
    }
    return varsMap.get(varName);
  });
}

/**
 * Генерирует случайное значение для переменной.
 * Да, вот так вот эти значения захардкодены, плохо, знаю.
 *
 * @param {string} varName
 * @returns {string}
 */
function getVarValue(varName) {
  const vars = new Map([
    ['имя.муж', [
      'Андрей',
      'Алексей',
      'Семен Игоревич',
      'Александр Сергеевич',
      'Евгений',
      'Михаил',
      'Дмитрий Анатольевич',
      'Сергей',
      'Виктор Сергеевич',
      'Владимир',
      'Юрий',
      'Антон Ильич',
      'Илья',
      'Валентин',
      'Павел',
    ]],
    ['male.name', [
      'Chris',
      'Tom',
      'Tony',
      'Mike',
      'David',
      'Bruce',
      'Anthony',
      'Michael',
      'George',
    ]],
  ]);
  if (vars.has(varName)) {
    return randomChoice(vars.get(varName));
  }
  return null;
}

/**
 * Возвращает реплику для ошибки в зависимости от количества ошибок и локализации
 * @param {number} faultsCount
 * @returns {string}
 */
function getFaultReplica(faultsCount) {
  const locales = i18n.get();
  if (faultsCount === 1) {
    return locales.faults[0];
  }
  return locales.faults[1];
}

/**
 * Возвращает реплику на случай ошибки семантического анализа
 * @returns {string}
 */
function getCompareErrorReplica() {
  const locales = i18n.get();
  return locales.compareErrorReplica;
}

/**
 * Выстраивает самую оптимальную ветку прохождения
 * на основании истории. Оптимальная - новейшая.
 *
 * @param {Map<string, string[]>} map - Карта узлов сценария
 * @param {string[]} history - История предыдущих сессий
 * @param {string} root - Корневой узел, с которого будет строиться путь
 * @returns {string[]}
 */
function computeOptimalBranch(map, history, root) {
  // здесь будет та же map, но потомок всегда будет
  // только один, новейший выбор то есть
  const sortedMap = new Map();
  // сначала разбить историю на списки
  const hisroryLists = history.map((x) => x.split(' '));
  // теперь идти последовательно по каждому узлу
  for (const [id, children] of map) {
    // если потомков нет, то и не записывать ничего
    if (!children || !children.length) {
      continue;
    }
    // если потомок один, то и выбирать нечего
    if (children.length === 1) {
      sortedMap.set(id, children[0]);
      continue;
    }
    // воссоздать историю для конкретно этого узла
    const nodeHistory = hisroryLists.reduce((acc, list) => {
      const nodeIndex = list.indexOf(String(id));
      if (nodeIndex >= 0 && nodeIndex < list.length - 1) {
        // пуш в массив того узла, на который был переход
        acc.push(list[nodeIndex + 1]);
      }
      return acc;
    }, []);
    // теперь для каждого потомка посчитать его "новейшесть"
    const childrenWithScores = children.map(
      (x) => {
        const index = nodeHistory.indexOf(String(x));
        const score = index === -1
          ? nodeHistory.length
          : index;
        return [x, score];
      },
    );
    // отсортировать по очкам
    childrenWithScores.sort(
      ([, scoreA], [, scoreB]) => (
        scoreA === scoreB
          ? Math.random() - 0.5 // если равны, то вперемешку
          : scoreB - scoreA
      ),
    );
    // и добавить полученные данные в sortedMap
    sortedMap.set(id, childrenWithScores[0][0]);
  }
  // теперь можно строить последовательно путь
  const path = [root];
  while (path.length < 1001) {
    // защита, на всякий случай
    if (path.length >= 1000) {
      throw new Error('Path is too long! Cycled?');
    }
    const currentNode = path[path.length - 1];
    // если нет в карте, то на этом и конец
    if (!sortedMap.has(currentNode)) {
      break;
    }
    const next = sortedMap.get(currentNode);
    // исключить зацикленность
    if (path.includes(next)) {
      break;
    }
    path.push(next);
  }
  // путь найден
  return path;
}

module.exports = {
  getFaultReplica,
  getCompareErrorReplica,
  parseNodes,
  parseExpectation,
  computeOptimalBranch,
  openExpectationWords,
  hideExpectationWords,
};
