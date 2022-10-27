const monitoringEvents = require('../../tools/monitoring-events');

// Всякая сложная статистика по мониторинговым событиям

module.exports = [{
  method: 'get',
  path: '/registered-accounts-activity',
  async handler(ctx) {
    // average-trains-per-first-day-for-new-accounts
    // average-script-patches-per-first-day-for-new-accounts
    // average-user-adds-per-first-day-for-new-accounts
    const periodStart = new Date(+ctx.query.start || 0);
    const periodEnd = new Date(+ctx.query.end || Date.now());
    const SQLPeriodStart = ctx.memory.sqlDatetime(periodStart);
    const SQLPeriodEnd = ctx.memory.sqlDatetime(periodEnd);

    // const registeredAccountsEvents = await ctx.db.MonitoringEvent.findAll({
    //   where: {
    //     type: monitoringEvents.types.ACCOUNT_REGISTERED,
    //     createdAt: {
    //       [ctx.memory.Op.between]: [periodStart, periodEnd],
    //     },
    //   },
    // });
    const registeredAccountsEvents = await ctx.memory.select(`
      select extra->>'accountId' "accountId", "createdAt"
      from "MonitoringEvents"
      where
        "createdAt" between ${SQLPeriodStart} and ${SQLPeriodEnd}
        and type = '${monitoringEvents.types.ACCOUNT_REGISTERED}'
    `);

    /**
     * @typedef {{ averageTrainsDuration: number, scriptPatches: number, userAdds: number }} AccData
     * @type {Map<string, AccData[]>}
     */
    const datesMap = new Map();
    await Promise.all(registeredAccountsEvents.map(
      async (event) => {
        const { accountId } = event;
        const createdAt = new Date(event.createdAt);
        const accountRegDate = ctx.memory.sqlDatetime(createdAt);
        const datePeriod = `${accountRegDate} and ${accountRegDate} + interval '1 day'`;
        const [
          [{ value: averageTrainsDuration }],
          [{ scriptPatches, userAdds }],
        ] = await Promise.all([
          ctx.memory.select(`
            select coalesce(sum(duration) / count(*), 0) "value"
            from "Sessions"
            where
              "accountId" = ${accountId}
              and "createdAt" between ${datePeriod}
          `),
          ctx.memory.select(`
            select
              count(
                case when type = '${monitoringEvents.types.SCRIPT_PATCHED}' then 1 else null end
              ) as "scriptPatches",
              count(
                case when type = '${monitoringEvents.types.USER_CREATED}' then 1 else null end
              ) as "userAdds"
            from
              "MonitoringEvents"
            where
              "createdAt" between ${datePeriod}
              and (extra->>'accountId')::integer = ${accountId}
          `),
        ]);

        const value = { averageTrainsDuration, scriptPatches, userAdds };
        const key = getDateKey(createdAt);
        if (datesMap.has(key)) {
          datesMap.get(key).push(value);
        } else {
          datesMap.set(key, [value]);
        }
      },
    ));

    ctx.body = {};
    const currentDate = new Date(periodStart);
    while (currentDate < periodEnd) {
      const key = getDateKey(currentDate);

      /**
       * @typedef {{ sessionsDuration: number, scriptPatches: number, userAdds: number }} DateValue
       * @type {DateValue}
       */
      const zeroValue = {
        sessionsDuration: 0,
        scriptPatches: 0,
        userAdds: 0,
      };
      if (datesMap.has(key)) {
        ctx.body[key] = datesMap.get(key).reduce(
          /**
           * @param {DateValue} prev
           */
          (prev, val, index, arr) => {
            /* eslint-disable no-param-reassign */
            prev.sessionsDuration += val.averageTrainsDuration / arr.length;
            prev.scriptPatches += val.scriptPatches / arr.length;
            prev.userAdds += val.userAdds / arr.length;
            /* eslint-enable */
            return prev;
          },
          zeroValue,
        );
      } else {
        ctx.body[key] = zeroValue;
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  },
}, {
  method: 'get',
  path: '/live-students-activity',
  async handler(ctx) {
    const periodStart = new Date(+ctx.query.start || 0);
    const periodEnd = new Date(+ctx.query.end || Date.now());
    const SQLPeriodStart = ctx.memory.sqlDatetime(periodStart);
    const SQLPeriodEnd = ctx.memory.sqlDatetime(periodEnd);
    const { detalization = 'day' } = ctx.query;
    ctx.assert(['day', 'week'].includes(detalization), 400, 'Invalid detalization');
    // const groupBy = detalization === 'day'
    //   ? 'date(sessions.createdAt)'
    //   : 'strftime(\'%W\', sessions.createdAt)';

    const rows = await ctx.memory.select(`
      select
        date("Sessions"."createdAt") as date,
        sum("Sessions".duration) / count(*) as duration
      from
        "Accounts"
        join "Sessions" on "Sessions"."accountId" = "Accounts".id
        join "Users" on "Users".id = "Sessions"."userId"
      where
        "Accounts".status = 'live'
        and "Users".role = 'student'
        and "Sessions"."createdAt" between ${SQLPeriodStart} and ${SQLPeriodEnd}
      group by
        date("Sessions"."createdAt")
      order by
        date("Sessions"."createdAt") asc
    `);
    const datesMap = new Map(rows.map(
      ({ date, duration }) => [getDateKey(new Date(date)), duration],
    ));
    // console.log(datesMap)

    const currentDate = new Date(periodStart);
    ctx.body = [];
    while (currentDate < periodEnd) {
      if (detalization === 'day') {
        const key = getDateKey(currentDate);
        if (datesMap.has(key)) {
          ctx.body.push({
            date: key,
            duration: datesMap.get(key),
          });
        } else {
          ctx.body.push({
            date: key,
            duration: 0,
          });
        }

        currentDate.setDate(currentDate.getDate() + 1);
      } else {
        const date = getDateKey(currentDate);
        let duration = 0;

        for (let i = 0; i < 7; i += 1) {
          const key = getDateKey(currentDate);
          if (datesMap.has(key)) {
            duration += datesMap.get(key) / 7;
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }

        ctx.body.push({ date, duration });
      }
    }
  },
}, {
  method: 'get',
  path: '/paid-users-info',
  async handler(ctx) {
    const [{ paidUsersCount, accountsCount }] = await ctx.memory.select(`
      select
        sum("usersLimit") - count(*) "paidUsersCount",
        count(*) "accountsCount"
      from "Accounts"
      where "usersLimit" > 0
    `);
    ctx.body = { paidUsersCount, accountsCount };
  },
}];

/**
 * Формирование строки-ключа из даты
 *
 * @param {Date} value
 * @returns {string}
 */
function getDateKey(value) {
  const date = value.getDate();
  const month = value.getMonth();
  const year = value.getFullYear();
  return `${pad(date)}.${pad(month + 1)}.${year}`;
}

function pad(num, count = 2) {
  const snum = String(num);
  return '0'.repeat(count - snum.length) + snum;
}
