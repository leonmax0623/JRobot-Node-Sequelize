// Используется именно этот модуль, а не base-64,
// потому что он может распарсить строчку '1570351692_武士0',
// а base-64 не может
const { base64encode } = require('nodejs-base64');

module.exports = [{
  method: 'post',
  path: '/feedbacks-subscription',
  /**
   * Получение/установка флага Root.sendFeedbacks
   */
  async handler(ctx) {
    // Если указано значение, то обновляю
    if (ctx.request.body && 'value' in ctx.request.body) {
      await ctx.state.root.update({
        sendFeedbacks: !!ctx.request.body.value,
      });
    }

    ctx.body = { value: ctx.state.root.sendFeedbacks };
  },
}, {
  method: 'get',
  path: '/feedbacks',
  /**
   * Получение списка всех фидбеков
   */
  async handler(ctx) {
    ctx.body = await ctx.memory.select(`
      select
        feedback.id id,
        feedback."userId" "userId",
        feedback."createdAt" "createdAt",
        feedback.message message,
        feedback.contact contact,
        array_agg(attachment.id) attachments
      from
        "Feedbacks" as feedback
        left join "FeedbackAttachments" as attachment on attachment."feedbackId" = feedback.id
      group by feedback.id
      order by feedback."createdAt" desc
    `);
  },
}, {
  method: 'delete',
  path: '/feedbacks',
  /**
   * Удаление фидбека и всех вложений
   */
  async handler(ctx) {
    ctx.assert(ctx.query.id, 400, 'No id specified');

    await Promise.all([
      ctx.db.Feedback.destroy({
        where: { id: ctx.query.id },
      }),
      ctx.db.FeedbackAttachment.destroy({
        where: { feedbackId: ctx.query.id },
      }),
    ]);

    ctx.status = 204;
  },
}, {
  method: 'get',
  path: '/feedback-attachment',
  /**
   * Загрузка данных одного прикрепления
   *
   * query.id - id прикрепления
   */
  async handler(ctx) {
    const { id } = ctx.query;
    ctx.assert(id, 400, 'No id specified');

    const attachment = await ctx.db.FeedbackAttachment.findByPk(+id);
    ctx.assert(attachment, 400, 'Attachment not found');

    ctx.body = attachment.data;
    ctx.type = attachment.type;

    // base64.encode на случай, если в имени файла (которое даёт пользователь) есть
    // недопустимые для заголовков символы
    ctx.set('x-original-filename', base64encode(attachment.name));
  },
}];
