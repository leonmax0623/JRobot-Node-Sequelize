module.exports = (sequelize, DataTypes) => {
  const Script = sequelize.define('Script', {
    /*
      caption: String, - название сценария
      description: String, - описание сценария
      autoRestart: Boolean, - перезапускать ли сценарий
      examination?: { - параметры экзамен
        allowedFaults: Number, - разрешённое количество ошибок в сесии
        allowedDuration: Number, - разрешённая длительность сессии
        requiredPasses: Number - сколько надо пройти для сдачи
      },
      gradualPassageMode?: Boolean, - включён ли режим постепенного прохождения
    */
    meta: {
      type: DataTypes.JSON,
      defaultValue: null,
    },
    /*
      Подробнее см. в src/sockets/dialog-session/StructureReader

      root: String - корневой узел
      nodes: Object - узлы
      branches?: String[] - список всех веток в сценарии (оптимизация для подсчёта статистики)
    */
    structure: DataTypes.JSON,

    // Когда сценарий был "уничтожен" (архивирован)
    archivedAt: {
      type: DataTypes.DATE,
      defaultValue: null,
    },

    // Когда сценарий был "уничтожен" (удален)
    destroyedAt: {
      type: DataTypes.DATE,
      defaultValue: null,
    },

    // Опубликован ли сценарий (используется партнёрскими аккаунтами)
    public: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  });

  Script.associate = function (models) {
    // Принадлежит сессиям
    models.Script.hasMany(models.Session, { as: 'Sessions', foreignKey: 'scriptId' });

    // Может иметь категории
    models.Script.belongsTo(models.PartnerScriptCategory, { foreignKey: 'partnerScriptCategoryId' });

    // Может принадлежать многим группам аккаунта
    models.Script.belongsToMany(models.Group, {
      through: 'GroupScript',
      foreignKey: 'scriptId',
      as: {
        singular: 'Group',
        plural: 'Groups',
      },
    });

    // На него может быть подписано множество аккаунтов, как на партнёрский
    models.Script.belongsToMany(models.Account, {
      through: 'AccountPartnerScript',
      foreignKey: 'scriptId',
      as: {
        singular: 'Subscriber',
        plural: 'Subscribers',
      },
    });
  };

  return Script;
};
