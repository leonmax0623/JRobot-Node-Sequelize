const PATH = '/script_categories';

module.exports = [
  {
    method: 'get',
    path: PATH,
    // Получение списка категорий
    async handler(ctx) {
      const { id: scriptCategoryId } = ctx.query;

      if (isNaN(scriptCategoryId)) {
        const data = await ctx.db.ScriptCategories.findAll({
          attributes: [
            'id',
            'name',
          ],
        });

        ctx.body = data.map((x) => {
          const {
            id,
            name,
          } = x.dataValues;

          return {
            id,
            name,
          };
        });
      } else {
        const data = await ctx.db.ScriptCategories.findByPk(scriptCategoryId);

        ctx.assert(data, 404, 'Script not found');

        const { id, name } = data.dataValues;

        ctx.body = {
          id, name,
        };
      }
    },
  },

  {
    method: 'put',
    path: PATH,
    // создание категории
    async handler(ctx) {
      const { id } = await ctx.db.ScriptCategories.create({
        ...ctx.request.body,
      });
      ctx.body = { id };
      ctx.status = 201;
    },
  },

  {
    method: 'patch',
    path: PATH,
    async handler(ctx) {
      const item = await ctx.db.ScriptCategories.findByPk(ctx.request.body.id);
      ctx.assert(item, 404, 'Category not found');
      await item.update(ctx.request.body);
      ctx.status = 204;
    },
  },

  {
    method: 'delete',
    path: PATH,
    async handler(ctx) {
      const item = await ctx.db.ScriptCategories.findByPk(ctx.query.id);
      ctx.assert(item, 404, 'Category not found');
      if (!item) ctx.throw(404);
      await item.destroy();
      ctx.status = 204;
    },
  },
];
