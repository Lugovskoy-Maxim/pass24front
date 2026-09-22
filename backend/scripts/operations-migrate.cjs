/* Build first. Credentials come from the environment, never command arguments.
 * node --env-file=.env scripts/operations-migrate.cjs check /private/manifest.json
 * Commands that write require --write and refuse import/rollback after cutover.
 */
const { createConnection } = require('mongoose');
const { writeFile } = require('node:fs/promises');
const { OperationsStore } = require('../dist/operations/operations.store');
const {
  OperationsMigration,
} = require('../dist/operations/operations.migration');

async function main() {
  const [command, file, ...flags] = process.argv.slice(2);
  if (
    ![
      'check',
      'import',
      'verify',
      'pause',
      'open',
      'rollback-before-open',
    ].includes(command)
  )
    throw Error(
      'Команды: check, import, verify, pause, open, rollback-before-open.',
    );
  const write = flags.includes('--write') || file === '--write';
  if (
    ['import', 'pause', 'open', 'rollback-before-open'].includes(command) &&
    !write
  )
    throw Error('Для изменения состояния нужен --write.');
  if (!process.env.MONGODB_URI) throw Error('Не задан MONGODB_URI.');
  const connection = await createConnection(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
  }).asPromise();
  try {
    const store = new OperationsStore(connection);
    const migration = new OperationsMigration(
      store,
      process.env.MSTYLE_PII_KEY || process.env.JWT_SECRET || '',
    );
    const state = await store.ownership();
    if (command === 'pause') {
      await store
        .collection('settings')
        .updateOne(
          { key: 'ownership' },
          {
            $set: { mode: 'paused' },
            $inc: { generation: 1, write_serial: 1 },
          },
        );
      console.log(
        'Запись Pass приостановлена. Отдельно приостановите запись Mstyle.',
      );
      return;
    }
    if (command === 'rollback-before-open') {
      if (state?.ever_opened || state?.mode === 'pass')
        throw Error('После открытия Pass возврат к архивной базе запрещён.');
      if (state?.migration_lock) throw Error('Выполняется импорт.');
      await store
        .collection('settings')
        .updateOne(
          { key: 'ownership', ever_opened: { $ne: true } },
          { $set: { mode: 'mstyle' }, $inc: { generation: 1 } },
        );
      console.log(
        'Режим Pass возвращён в mstyle. Флаг сайта переключается отдельно.',
      );
      return;
    }
    const bundle = await migration.load(file);
    if (
      process.env.MSTYLE_ENVIRONMENT &&
      bundle.environment !== process.env.MSTYLE_ENVIRONMENT
    )
      throw Error('Окружение экспорта не совпадает.');
    let result;
    if (command === 'check') {
      const { counts, totals, issues } = await migration.prepare(bundle);
      result = { counts, totals, issues, dry_run: true };
    } else if (command === 'import') result = await migration.import(bundle);
    else result = await migration.verify(bundle);
    if (command === 'open') {
      const topology = await connection.db.admin().command({ hello: 1 });
      if (!topology.setName) throw Error('Для транзакций необходим MongoDB replica set.');
      if (bundle.owner_mode !== 'paused' || !result.ok)
        throw Error(
          'Нужен финальный экспорт при остановленной записи Mstyle и сверка без расхождений.',
        );
      const saved = await store
        .collection('settings')
        .findOne({ key: 'migration', digest: bundle.digest });
      if (!saved || state?.migration_lock)
        throw Error(
          'Этот экспорт не импортирован либо импорт ещё выполняется.',
        );
      const runningJobs = await store
        .collection('outbox')
        .countDocuments({ state: 'running' });
      if (runningJobs) throw Error('Дождитесь завершения фоновых операций.');
      const opened = await store
        .collection('settings')
        .findOneAndUpdate(
          {
            key: 'ownership',
            mode: 'paused',
            migration_lock: { $exists: false },
          },
          {
            $set: {
              mode: 'pass',
              ever_opened: true,
              opened_at: new Date().toISOString(),
              migration_digest: bundle.digest,
            },
            $inc: { generation: 1, write_serial: 1 },
          },
          { returnDocument: 'after' },
        );
      if (!opened) throw Error('Pass не находится в режиме паузы.');
      result.opened = true;
    }
    const reportIndex = flags.indexOf('--report');
    const output = JSON.stringify(result, null, 2);
    if (reportIndex >= 0)
      await writeFile(flags[reportIndex + 1], output, {
        flag: 'wx',
        mode: 0o600,
      });
    console.log(output);
    if (result.ok === false || result.issues?.length) process.exitCode = 2;
  } finally {
    await connection.close();
  }
}
main().catch((error) => {
  // Driver connection errors may include credentials/host strings: hide them.
  console.error(
    error?.name?.startsWith('Mongo')
      ? 'Не удалось выполнить операцию MongoDB.'
      : error.message,
  );
  process.exitCode = 1;
});
