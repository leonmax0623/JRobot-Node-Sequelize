/**
 * Класс-утилита для автотаймера. Позволяет ставить (переставить) и отменить таймер
 */
module.exports = class {
  constructor(callback, timeout, setImmediate = true) {
    this._timer = null;
    this._callback = callback;
    this._timeout = timeout;

    if (setImmediate) {
      this.set();
    }
  }

  set() {
    this.clear();
    this._timer = setTimeout(this._callback, this._timeout);
  }

  clear() {
    clearTimeout(this._timer);
  }
};
