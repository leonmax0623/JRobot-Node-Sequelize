module.exports = [{
  method: 'post',
  path: '/payment-rates',
  // Установка данных о тарифах
  // (получение в публичном роутере)
  async handler(ctx) {
    // Можно верить фронту, что не подсунет гадости
    const rates = await ctx.db.PaymentRates.findOne();
    if (rates) {
      await rates.update(ctx.request.body);
      ctx.status = 204;
    } else {
      await ctx.db.PaymentRates.create(ctx.request.body);
      ctx.status = 201;
    }
  },
}, {
  method: 'get',
  path: '/partner-script-categories',
  // Взятие списка партнёрских категорий
  async handler(ctx) {
    const data = await ctx.db.PartnerScriptCategory.findAll();
    ctx.body = data.map(({ dataValues }) => dataValues);
  },
}, {
  method: 'post',
  path: '/partner-script-categories',
  // Создание/редактирование категории
  async handler(ctx) {
    const { name } = ctx.request.body || {};
    ctx.assert(name, 400, 'Name could not be null');
    if ('id' in ctx.query) {
      ctx.assert(!isNaN(ctx.query.id), 400, 'Invalid id (or not provided)');
      const item = await ctx.db.PartnerScriptCategory.findByPk(+ctx.query.id);
      ctx.assert(item, 404, 'Item not found');
      await item.update({ name });
      ctx.status = 204;
    } else {
      const item = await ctx.db.PartnerScriptCategory.create({ name });
      ctx.body = { id: item.id };
      ctx.status = 201;
    }
  },
}, {
  method: 'delete',
  path: '/partner-script-categories',
  // Удаление категории
  async handler(ctx) {
    ctx.assert(!isNaN(ctx.query.id), 400, 'Invalid id (or not provided)');
    const item = await ctx.db.PartnerScriptCategory.findByPk(+ctx.query.id);
    ctx.assert(item, 404, 'Item not found');
    await item.destroy();
    ctx.status = 204;
  },
}];
