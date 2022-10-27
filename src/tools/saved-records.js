/*
  Модуль занимается подсчетом записей реплик
*/

const cron = require('./cron');
const config = require('../../config');
const db = require('../../data/models');
const logger = require('intel').getLogger('saved-records');
const Sentry = require('@sentry/node');
const EasyYandexS3 = require('easy-yandex-s3');

const { Op } = db.Sequelize;
const startedTask = [];

/**
 * Настройка задачи по очистке
 */
function setup() {
  cron.schedule(config.crons.savedRecordsCron, process);
  logger.info('Saved Records scheduled');
}

/**
 * подсчет записей реплик
 */
async function process() {
  try {
    const s3 = new EasyYandexS3({
      auth: {
        accessKeyId: 'iA7IeqbrBvlx4OujmE7E',
        secretAccessKey: 'RjHYNx-looMeX96vJu1Xan1i8c8DjS_MOhfTs-9m',
      },
      Bucket: 'jrobot-voice-records',
      debug: false,
    });

    // const s3 = new EasyYandexS3({
    //   auth: {
    //     accessKeyId: 'ajekau5hnlc247unhgon',
    //     secretAccessKey: 'AQVN1FeLG9WCIf14wxcM7Drgn62i7x3hlPwW6o50',
    //   },
    //   Bucket: 'aefzxcbaerbz78',
    // });

    let prevId = 0;
    const list = await s3.GetList();
    if (list.CommonPrefixes && list.CommonPrefixes.length > 0) {
      const lastPrefix = list.CommonPrefixes[list.CommonPrefixes.length - 1];
      const subList = await s3.GetList(`/${lastPrefix.Prefix}`);
      if (subList.Contents.length) {
        const lastFile = subList.Contents[subList.Contents.length - 1];
        const lastFileName = lastFile.Key;
        const regex = /\/(\d+)\./gm;
        let foundFile = lastFileName.match(regex);
        foundFile = foundFile[0].replace('/', '');
        foundFile = foundFile.replace('.', '');
        // eslint-disable-next-line
        prevId = parseInt(foundFile);
      }
    }

    const replicas = await db.Replica.findAll({
      where: {
        record: {
          [Op.not]: null,
        },
        author: 'user',
        id: {
          [Op.gt]: prevId,
        },
      },
      order: [
        ['id', 'ASC'],
      ],
    });
  
    await replicas.map(async (item, index) => {
      if (index in startedTask)
        return null;

      startedTask.push(index);
      const folderName = Math.floor(item.id / 1000) * 1000;

      // eslint-disable-next-line
      await s3.Upload({
        buffer: item.record,
        name: `${item.id}.ogg`,
      }, `/${folderName}/`);

      // eslint-disable-next-line
      await s3.Upload({
        buffer: Buffer.from(item.text, 'utf8'),
        name: `${item.id}.txt`,
      }, `/${folderName}/`);

      const startedTaskIndex = startedTask.indexOf(index);
      if (startedTaskIndex > -1)
        startedTask.slice(startedTask.indexOf(index));

      logger.info(`Saved file to S3: ${item.id}`);
    });
  } catch (err) {
    Sentry.captureException(err);
    logger.error('Saved Records error |', err);
  }

  try {
    db.sequelize.query('SELECT s."accountId", count(r.id) as cnt_records, sum(length(r.record)) as total_size_records  FROM "Replicas" r JOIN "Sessions" s ON r."sessionId" = s.id WHERE r.record IS NOT NULL GROUP BY s."accountId"', { type: db.Sequelize.QueryTypes.SELECT }).then((result) => {
      for (const row of result) {
        const sizeInMb = Math.ceil(row.total_size_records / (1024 * 1024));

        db.Account.findOne({
          where: { id: row.accountId },
        }).then((account) => {
          if (account) {
            let { params } = account;
            if (!params) {
              params = {};
            }

            params.records_used = sizeInMb;

            db.Account.update(
              { params },
              { where: { id: row.accountId } },
            );
            logger.info(`Update records_used: ${sizeInMb} for account: ${row.accountId}`);

            // Удаление старых записей
            if (params && params.records_limit && params.records_limit < sizeInMb) {
              let sizeDiff = (sizeInMb - params.records_limit) * 1024 * 1024;
              db.sequelize.query(`SELECT s."accountId", r.id, length(r.record) as size_record
                                                FROM "Replicas" r
                                                         JOIN "Sessions" s ON r."sessionId" = s.id
                                                WHERE r.record IS NOT NULL
                                                  and s."accountId" = ${row.accountId}
                                                ORDER BY r.id ASC`, { type: db.Sequelize.QueryTypes.SELECT }).then((sub_result) => {
                const erasingIds = [];
                for (const sub_row of sub_result) {
                  if (sizeDiff > 0) {
                    erasingIds.push(sub_row.id);
                    sizeDiff -= sub_row.size_record;
                    logger.info(`Erased replica: ${sub_row.id} for account: ${row.accountId}`);
                  } else {
                    break;
                  }
                }
                if (erasingIds) {
                  db.Replica.update({ record: null }, {
                    where: {
                      id: { [Op.in]: erasingIds },
                    },
                  });
                }
              });
            }
          }
        });
      }
    });
  } catch (err) {
    Sentry.captureException(err);
    logger.error('Saved Records error |', err);
  }
}

module.exports = { setup };
