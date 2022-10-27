const memory = require('./memory');

/**
 * Подсчёт статистики для партнёра.
 * Какой аккаунт, с каким количество пользователей по какому сценарию сколько занимался.
 * Абсолютно и относительно общего времени в аккаунте.
 *
 * @typedef {{
 * scriptId: number,
 * accountId: number,
 * usersCount: number,
 * absoluteDuration: number,
 * relativeDuration: number
 * }} ScriptStats
 * @returns {Promise<ScriptStats[]>}
 */
async function computeForPartner({ partnerId, start, end }) {
  const period = memory.periodCondition('"Sessions"."createdAt"', { start, end });

  /** @type {{ scriptId: number, accountId: number, usersCount: duration, duration: number }[]} */
  const scriptsRows = await memory.select(`
    select "scriptId", "accountId", count("userId") "usersCount", sum(duration)::integer duration
    from (
        select
          "Scripts".id "scriptId",
          "Sessions"."accountId" "accountId",
          "Sessions"."userId" "userId",
          sum("Sessions".duration) duration
        from
          "Scripts"
          join "Accounts" on "Accounts".id = "Scripts"."accountId"
          left join (
            select "Sessions".*
            from
              "Sessions"
              join "Accounts" on "Sessions"."accountId" = "Accounts".id
            where
              "Accounts".id <> ${partnerId}
              and "Accounts".status = 'live'
              and "Accounts"."becomedLiveAt" < now()
              ${period ? `and ${period}` : ''}
          ) "Sessions" on "Sessions"."scriptId" = "Scripts".id
        where "Accounts".id = ${partnerId}
        group by "Scripts".id, "Sessions"."accountId", "Sessions"."userId"
      ) items
    where "accountId" is not null
    group by "scriptId", "accountId"
  `);

  if (!scriptsRows.length) {
    return [];
  }

  const accountIds = new Set(scriptsRows.map(({ accountId }) => accountId));
  /** @type {{ id: number, duration: number }[]} */
  const accountRows = accountIds.size === 0 ? [] : await memory.select(`
    select
      "accountId" id,
      sum(duration) duration
    from "Sessions"
    where
      "accountId" in (${[...accountIds].join(', ')})
      ${period ? `and ${period}` : ''}
    group by "accountId"
  `);
  const accountDuration = new Map(accountRows.map((val) => [val.id, val.duration]));

  return scriptsRows.map(({
    scriptId,
    accountId,
    duration,
    usersCount,
  }) => ({
    scriptId,
    accountId,
    usersCount,
    absoluteDuration: duration,
    relativeDuration: duration / accountDuration.get(accountId),
  }));
}

module.exports = { computeForPartner };
