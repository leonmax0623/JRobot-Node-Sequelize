const fs = require('fs');
const Sentry = require('@sentry/node');

module.exports = [{
  method: 'post',
  path: '/feedback',
  /**
   * Фидбек от пользователя. Сохраняется текст обращения,
   * дополнительные контакты и прикреплённые файлы.
   * Рассылается в виде письма каждому руту, который подписан (поле sendFeedbacks).
   *
   * Допускается не больше 3х фидбеков за час.
   */
  async handler(ctx) {
    // Первоначально проверяю, не было ли много фидбеков за последний час

    /**
     * Сделаны ли последние три фидбека в течение последнего часа
     * @type {{ value: boolean }[]}
     */
    const lastFeedbacks = await ctx.memory.select(`
      select now() - "createdAt" < interval '1 hour' as "value"
      from "Feedbacks" as feedback
      where "userId" = ${ctx.state.user.id}
      order by "createdAt" desc
      limit 3
    `);

    if (lastFeedbacks[2] && lastFeedbacks[2].value) {
      // Если третий из последних фидбек сделан в течение часа, то запрещено
      ctx.throw(429);
    }

    const { message, contact } = ctx.request.body;
    ctx.assert(message, 400, 'No message!');
    ctx.assert(typeof message === 'string', 400, 'Message is not a string!');

    /**
     * Данные о файлах, которые отправил пользователь
     * @type {File[]}
     */
    let files = ((ctx.request.files || {}).file || []);

    if (!Array.isArray(files)) {
      // Если прислан один файл, то делаю массив из одного
      files = [files];
    }

    /**
     * Данные самих файлов, который отправил пользователь
     * @type {{ name: string, type: string, data: Buffer }[]}
     */
    const attachments = await Promise.all(files.map(
      (file) => new Promise((resolve, reject) => {
        // path - путь к файлу, который даёт koa-body
        const { name, type, path } = file;

        // Читаю файл и разрешаю промис
        fs.readFile(path, (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve({
              name,
              type,
              data,
            });
          }
        });
      }),
    ));

    // Создаю фидбек
    const feedback = await ctx.db.Feedback.create({
      userId: ctx.state.user.id,
      message,
      contact,
    });

    // Сохраняю картинки
    await ctx.db.FeedbackAttachment.bulkCreate(
      attachments.map((val) => ({
        ...val,
        feedbackId: feedback.id,
      })),
    );

    // Далее отправляю отчёт на почту подписавшимся рутам

    // Беру подходящих рутов
    const roots = await ctx.db.Root.findAll({
      where: { sendFeedbacks: true },
    });

    // Занимаюсь рассылкой
    try {
      await Promise.all(roots.map(
        async ({ email }) => {
          // Составляю письмо
          const mail = {
            to: email,
            subject: `Фидбек от пользователя ${ctx.state.user.username} (№ ${feedback.id})`,
            /**
             * @type {{ filename: string, content: Buffer, contentType: string }[]}
             */
            attachments: attachments.map((val) => ({
              filename: val.name,
              content: val.data,
              contentType: val.type,
            })),
            html: ctx.mailer.replaceMustache(
              ctx.mailer.templates.get('feedback') || '',
              new Map([
                ['username', ctx.state.user.username],
                ['accountName', ctx.state.account.name],
                ['message', message],
                ['contact', contact || 'Не указано'],
              ]),
            ),
          };

          // Отправляю письмо
          await ctx.mailer.sendMail(mail);
        },
      ));
    } catch (err) {
      Sentry.captureException(err);
    }

    ctx.status = 204;
  },
}];
