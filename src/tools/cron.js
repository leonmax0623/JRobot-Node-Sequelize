const cron = require('node-cron');

// Класс, который валидирует и ставит задачи на cron
class Cron {
  constructor() {
    this.tasks = [];
  }

  /**
   * Планирование задачи
   * @param {string} cronExpression - крон-выражение. Например: '0 0 * * *'
   * @param {Function} callback - то, что сработает по крону
   * @param {*} options - параметры планирования
   */
  schedule(cronExpression, callback, options) {
    if (!cron.validate(cronExpression)) {
      throw new Error('Invalid cron expression');
    }

    const task = cron.schedule(cronExpression, callback, options);
    this.tasks.push(task);
    return task;
  }

  destroyAll() {
    this.tasks.forEach((task) => task.destroy());
  }
}

// Синглтон
module.exports = new Cron();
