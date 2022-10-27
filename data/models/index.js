
const intel = require('intel');

const fs = require('fs');
const pg = require('pg');

pg.defaults.parseInt8 = true;
const env = process.env.NODE_ENV || 'development';

const path = require('path');
const Sequelize = require('sequelize');
const cls = require('cls-hooked');
const config = require('../../config/sequelize.config.json')[env];

const namespace = cls.createNamespace('my-very-own-namespace');
Sequelize.useCLS(namespace);

const basename = path.basename(__filename);

const db = {};

let sequelize;

if (config.logging === true) {
  config.logging = (...msg) => intel.debug(msg)
}
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, config);
}

fs
  .readdirSync(__dirname)
  .filter((file) => (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js'))
  .forEach((file) => {
    const model = sequelize.import(path.join(__dirname, file));
    db[model.name] = model;
  });

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
