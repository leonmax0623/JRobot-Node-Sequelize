const strftime = require('strftime');
const { datefmt } = require('../../config').app.formatterOptions;
const chalk = require('chalk');

/* eslint-disable no-console */

module.exports = async (ctx, next) => {
  const start = new Date();
  let error = null;
  new Promise((resolve) => {
    ctx.res.once('close', resolve);
    ctx.res.once('finish', resolve);
  }).then(() => {
    const logTime = strftime(datefmt, new Date());
    const errorMessage = error && error.message;
    const { status } = error || ctx;
    const responseTime = `${Date.now() - start.getTime()}ms`;
    const contentLength = ctx.response.length || 0;
    const tokens = [
      `[${logTime}]`,
      chalk.blue.bold('-->'),
      chalk.blue(ctx.ip),
      colorizedStatus(status),
      chalk.magenta(`'${ctx.request.method.toUpperCase()} ${ctx.url}'`),
      responseTime,
      contentLength,
    ];
    if (ctx.state.user) {
      const { id } = ctx.state.user;
      tokens.splice(3, 0, chalk.cyan(`(${id})`));
    }
    if (errorMessage) {
      tokens.push(chalk.red.bold(errorMessage));
    }
    console.log(tokens.join(' '));
  });
  try {
    await next();
  } catch (e) {
    if (e.expose) {
      error = e;
    }
    throw e;
  }
};

function colorizedStatus(status) {
  return status < 200
    ? chalk.bgMagenta(status)
    : status < 300
      ? chalk.green(status)
      : status < 400
        ? chalk.yellow(status)
        : status < 500
          ? chalk.red(status)
          : chalk.red.bold(status);
}
