const memory = require('../../../tools/memory');

module.exports = {
  /**
   * Рассчёт статистики пользователя
   *
   * @typedef {{
   * scriptId: number,
   * duration: number,
   * count: number,
   * success: number
   * }} ScriptStats
   * @param {number} userId ID пользователя
   * @returns {Promise<ScriptStats[]>}
   */
  myStats(userId) {
    // const period = memory.periodCondition('"createdAt"', { start, end });
    /**
     * @type {{
     * scriptId: number,
     * duration: number,
     * success: number,
     * count: number,
     * }[]}
     */
    return memory.select(`
      select
        "scriptId",
        sum(duration) duration,
        count(*) count,
        sum(case when success then 1 else 0 end) success
      from "Sessions"
      where "userId" = ${userId} and "scriptId" is not null
      group by "scriptId"
    `);
  },
  /**
   * Рассчёт статистики по многим пользователям
   *
   * @typedef {{ userId: number, count: number, success: number, duration: number }} UsersStats
   * @returns {Promise<UsersStats[]>}
   */
  usersStats({
    accountId, // required
    groupId,
    scriptId,
    start,
    end,
  }) {
    const period = memory.periodCondition('"createdAt"', { start, end });

    return memory.select(`
      select
        "Users".id "userId",
        count(sessions.id) count,
        sum(case when sessions.success then 1 else 0 end) success,
        coalesce(sum(sessions.duration), 0) duration
      from
        "Users"
        left join (
          select *
          from "Sessions"
          where
            "accountId" = ${accountId}
            ${period ? `and ${period}` : ''}
            ${scriptId ? `and "scriptId" = ${scriptId}` : ''}
        ) sessions on sessions."userId" = "Users".id
      where
        "Users"."accountId" = ${accountId}
        ${groupId ? `and "Users"."groupId" = ${groupId}` : ''}
      group by "Users".id
    `);
  },
  /**
   * Прогресс постепенного прохождения сценария
   *
   * @returns {{
   * userId?: number,
   * scriptId: number,
   * score: number
   * }}
   */
  async gradualProgress({
    userId, accountId, groupId, scriptId,
  }) {
    // Здесь лежат различные условия для WHERE
    const conditions = [
      // Беру только сценарии с включённым режимом постепенного прохождения
      '("Scripts".meta::json->>\'gradualPassageMode\')::bool is true',

      // Срока подходит тогда, когда
      '("Scripts"."structure"::json->>\'branches\')::jsonb ? "Sessions"."nodesBranch"',
    ];

    // Условия на определённые пользователя/аккаунт/группу/сценарий
    if (userId) {
      conditions.push(`"Users".id = ${userId}`);
    }
    if (accountId) {
      conditions.push(`"Users"."accountId" = ${accountId}`);
    }
    if (groupId) {
      conditions.push(`"Users"."groupId" = ${groupId}`);
    }
    if (scriptId) {
      conditions.push(`"Scripts".id = ${scriptId}`);
    }

    /**
     * Статистика для каждого пользователя и каждого сценария
     *
     * @type {{ userId: number, scriptId: number, maxValue: number, count: number }[]}
     */
    const branchesStats = await memory.select(`
      select
        "Sessions"."userId" "userId",
        "Sessions"."scriptId" "scriptId",
        max("Sessions"."trueHiddenWordsValue") "value",
        count(*) "count"
      from
        "Users"
        join "Sessions" on "Sessions"."userId" = "Users".id
        join "Scripts" on "Scripts".id = "Sessions"."scriptId"
      where
        ${conditions.join(' and ')}
      group by
        "Sessions"."userId",
        "Sessions"."scriptId",
        "Sessions"."nodesBranch"
    `);

    // Ничего нет? Дальше не идти
    if (!branchesStats.length) {
      return [];
    }

    // Все id сценариев в branchesStats
    const scripts = branchesStats.map(({ scriptId: val }) => val);

    /**
     * Информация по сценариям. Карта соответствия
     * (id сценария - количество веток в нём)
     * @type {Map<number, number>} id-count
     */
    const scriptBranchCounts = new Map(
      (
        await memory.select(`
          select id, json_array_length(("structure"::json->>'branches')::json) "count"
          from "Scripts"
          where id in (${scripts.join(',')})
        `)
      ).map(({ id, count }) => [id, count]),
    );

    const results = [];
    for (const [uid, userGroup] of Object.entries(groupBy(branchesStats, 'userId'))) {
      for (const [sid, userScriptGroup] of Object.entries(groupBy(userGroup, 'scriptId'))) {
        results.push({
          userId: +uid,
          scriptId: +sid,
          score: computeGradualPassageScore(scriptBranchCounts.get(+sid), userScriptGroup),
        });
      }
    }

    return results;
  },
};

/**
 * Группировка строк по одному полю в строках
 * @param {any[]} rows Строки
 * @param {string} field Поле, по которому будет произведена группировка
 * @returns {{ fieldValue: groupedRows[] }}
 */
function groupBy(rows, field) {
  return rows.reduce((prev, val) => {
    const key = val[field];
    if (key in prev) {
      prev[key].push(val);
    } else {
      prev[key] = [val];
    }
    return prev;
  }, {});
}

/**
 * Рассчёт прогресса постепенного прохождения пользователя по сценарию.
 * Берутся данные статистики по каждой ветке (количество сессий по ней и лучшее скрытие слов).
 * Из них считается значение ознакомления (каждая ветка должна быть пройдена 2 раза).
 * Также считается среднее скрытие слов по всем веткам.
 * Общие 100% прогресса - 15% ознакомления (0-15) + 85% скрытия (0-85)
 *
 * @param {number} branchesCount Количество ветвей в сценарии
 * @param {{ count: number, value: number }} rows Статистика пользователя по ветвям сценария
 * @return {number} Прогресс
 */
function computeGradualPassageScore(branchesCount, rows) {
  // Сумма рекордов
  const rowsValueSum = rows.reduce((prev, val) => prev + val.value, 0);

  // Сумма количеств
  const rowsCountsSum = rows.reduce((prev, val) => prev + Math.min(2, val.count), 0);

  return (
    0.15 * (rowsCountsSum / (branchesCount * 2))
    + 0.85 * (rowsValueSum / branchesCount)
  );
}
