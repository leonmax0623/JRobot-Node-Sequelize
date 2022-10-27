const XLSX = require('xlsx');
const send = require('koa-send');

module.exports = [{
  method: 'get',
  path: '/download-report',
  /**
     * генерация репорта
     */
  async handler(ctx) {
    const { sqlDatetime } = ctx.memory;

    const datesRange = [
      sqlDatetime(new Date(+ctx.query.from_ts || 0)),
      sqlDatetime(new Date(+ctx.query.to_ts || Date.now())),
    ];
    const conditions = [
      `"Sessions"."createdAt" between ${datesRange.join(' and ')}`,
    ];

    const sessions = await ctx.memory.select(`
            select
              "Sessions".id id,
              "Sessions"."userId" "userId",
              "Sessions"."scriptId" "scriptId",
              "Sessions".success success,
              "Sessions".examination examination,
              "Sessions".duration duration,
              "Sessions"."createdAt" "createdAt",
              "Sessions".faults faults,
              "Sessions"."courseId" "courseId",
              "Accounts".name "accountName",
              "Users".name "userName",
              "Users".username "userEmail",
              "Scripts".meta->>'caption' "scriptName"
            from
              "Sessions"
            left join "Accounts" on "Sessions"."accountId" = "Accounts".id
            left join "Users" on "Sessions"."userId" = "Users".id
            left join "Scripts" on "Sessions"."scriptId" = "Scripts".id
            where
              ${conditions.join(' and ')}
            order by "Sessions"."createdAt" desc
        `);

    const csvLines = [];

    csvLines.push([
      'Session Id',
      'User Id',
      'Script Id',
      'Is Success',
      'Is Exam',
      'Duration',
      'Faults',
      'Account Name',
      'User Name',
      'User Email',
      'Script Name',
      'Created At',
    ]);

    sessions.forEach((row) => {
      csvLines.push([
        row.id,
        row.userId,
        row.scriptId,
        (row.success ? 1 : 0),
        (row.examination ? 1 : 0),
        Math.round(row.duration / 60),
        row.faults,
        row.accountName,
        row.userName,
        row.userEmail,
        row.scriptName,
        row.createdAt,
      ]);
    });

    const workSheet = XLSX.utils.aoa_to_sheet(csvLines);

    const workBook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workBook, workSheet, 'Sheet 1');

    XLSX.writeFile(workBook, './sample.xlsx');

    ctx.set('Content-disposition', 'attachment; filename=report.xlsx');
    ctx.set('Content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    await send(ctx, './sample.xlsx', {});
  },
}];
