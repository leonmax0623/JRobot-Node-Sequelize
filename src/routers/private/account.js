const amoHooks = require('../../amoCRM/hooks');

module.exports = [
  {
    method: 'patch',
    path: '/account-name',
    /**
     * Изменение имени аккаунта
     */
    async handler(ctx) {
      allowedOnlyForAdmin(ctx);
      const { name } = ctx.request.body;
      ctx.assert(name, 400, 'New account name not provided');
      const existent = await ctx.db.Account.findOne({ where: { name } });
      ctx.assert(!existent, 400, 'account_already_exists');
      await ctx.db.Account.update(
        { name },
        { where: { id: ctx.state.user.accountId } },
      );
      ctx.status = 204;
    },
  },
  {
    method: 'post',
    path: '/request-payment',
    /**
     * Запрос оплаты
     */
    async handler(ctx) {
      allowedOnlyForAdmin(ctx);

      const account = await ctx.db.Account.findByPk(ctx.state.user.accountId);
      ctx.assert(account, 404, 'Account not found');
      ctx.assert(account.leadId, 403, 'Account has not binded to any lead');
      ctx.assert(account.allowPaymentRequests, 403, 'Payment requests are not allowed');

      ctx.assert(ctx.request.body, 400, 'no_data');
      const { rate, usersCount = 0, period = 0 } = ctx.request.body;
      ctx.assert(['base', 'extended', 'professional'].includes(rate), 400, `Invalid rate - ${rate}`);
      ctx.assert(!isNaN(usersCount), 400, 'Users count not a number');
      ctx.assert(!isNaN(period), 400, 'Users count not a number');

      await amoHooks.paymentRequested(account, { rate, usersCount, period });
      ctx.status = 204;
    },
  },
];

function allowedOnlyForAdmin(ctx) {
  ctx.assert(ctx.state.user.role === 'admin', 403, 'Allowed only for admin!');
}
