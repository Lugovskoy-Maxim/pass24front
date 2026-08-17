/**
 * Адаптация старых users под поля Pass-identity.
 *
 * По умолчанию dry-run. Пароли / invite / OTP не трогает.
 * passSubject не переписывает, если уже есть.
 * --apply сначала пишет JSON-бэкап в backend/backups/adapt-users/<stamp>/.
 *
 *   npm run adapt:users
 *   npm run adapt:users -- --apply
 *   npm run adapt:users -- --apply --sync
 *   npm run adapt:users -- --apply --no-backup
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { spawnSync } from 'child_process';
import { config } from 'dotenv';
import mongoose from 'mongoose';
import { userAdaptPatch } from '../src/common/pass-identity';

config({ path: resolve(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const SYNC = process.argv.includes('--sync');
const NO_BACKUP = process.argv.includes('--no-backup');

function resolveAuthUri(): string {
  const explicit = process.env.MONGODB_AUTH_URI?.trim();
  if (explicit) return explicit;
  const mainUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pass24';
  const match = mainUri.match(
    /^(mongodb(?:\+srv)?:\/\/[^/]+)(\/[^/?]+)?(\?.*)?$/,
  );
  if (!match) return 'mongodb://localhost:27017/pass24_auth';
  return `${match[1]}/pass24_auth${match[3] || ''}`;
}

function resolveMainUri(): string {
  return process.env.MONGODB_URI || 'mongodb://localhost:27017/pass24';
}

function maskUri(uri: string): string {
  return uri.replace(/:[^:@/]+@/, ':****@');
}

function backupDir(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  const dir = resolve(__dirname, `../backups/adapt-users/${stamp}`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

async function writeJsonDump(
  col: mongoose.mongo.Collection,
  file: string,
): Promise<number> {
  const docs = await col.find({}).toArray();
  writeFileSync(file, `${JSON.stringify(docs)}\n`, { mode: 0o600 });
  return docs.length;
}

function tryMongoDump(uri: string, dbName: string, outFile: string): boolean {
  const result = spawnSync(
    'mongodump',
    ['--uri', uri, '--db', dbName, '--archive=-', '--gzip'],
    { maxBuffer: 512 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0 || !result.stdout?.length) {
    return false;
  }
  writeFileSync(outFile, result.stdout, { mode: 0o600 });
  return true;
}

async function backupBeforeWrite(authUri: string): Promise<string> {
  const dir = backupDir();
  const usersCol = mongoose.connection.collection('users');
  const users = await writeJsonDump(usersCol, join(dir, 'users.json'));
  const dumps: string[] = [`users.json (${users})`];

  if (tryMongoDump(authUri, dbNameFromUri(authUri, 'pass24_auth'), join(dir, 'pass24_auth.gz'))) {
    dumps.push('pass24_auth.gz');
  }

  if (SYNC) {
    const mainUri = resolveMainUri();
    const main = await mongoose.createConnection(mainUri).asPromise();
    try {
      const names = (await main.db.listCollections().toArray())
        .map((c) => c.name)
        .filter((name) => name.startsWith('mstyle_v2_'));
      for (const name of names) {
        const n = await writeJsonDump(main.collection(name), join(dir, `${name}.json`));
        dumps.push(`${name}.json (${n})`);
      }
    } finally {
      await main.close();
    }
    if (tryMongoDump(mainUri, dbNameFromUri(mainUri, 'pass24'), join(dir, 'pass24.gz'))) {
      dumps.push('pass24.gz');
    }
  }

  console.log(JSON.stringify({ backup: dir, files: dumps }, null, 2));
  return dir;
}

function dbNameFromUri(uri: string, fallback: string): string {
  const match = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^/?]+)/);
  return match?.[1] || fallback;
}

type UserLean = {
  _id: mongoose.Types.ObjectId;
  email?: string;
  fullName?: string;
  role?: string;
  company?: string;
  passSubject?: string;
  identityStatus?: string;
  authVersion?: number;
  displayName?: string;
  profileType?: string;
  legalForm?: string | null;
  privateDataComplete?: boolean;
  isBlocked?: boolean;
  isActive?: boolean;
  invitePending?: boolean;
  parentTenantId?: mongoose.Types.ObjectId;
};

async function adaptUsers() {
  const uri = resolveAuthUri();
  console.log(APPLY ? 'APPLY' : 'DRY-RUN', maskUri(uri));
  await mongoose.connect(uri);

  if (APPLY && !NO_BACKUP) {
    await backupBeforeWrite(uri);
  } else if (APPLY && NO_BACKUP) {
    console.log('backup skipped (--no-backup)');
  }

  const col = mongoose.connection.collection<UserLean>('users');
  const users = await col.find({}).project({ password: 0 }).toArray();

  let skipped = 0;
  let updated = 0;
  let failed = 0;
  const samples: string[] = [];

  for (const user of users) {
    const patch = userAdaptPatch(user);
    if (!patch) {
      skipped += 1;
      continue;
    }
    const label = `${user._id} ${user.email || user.fullName || ''} ${Object.keys(patch).join(',')}`;
    if (samples.length < 20) samples.push(label);
    if (!APPLY) {
      updated += 1;
      continue;
    }
    try {
      await col.updateOne({ _id: user._id }, { $set: patch });
      updated += 1;
    } catch (err) {
      failed += 1;
      console.error(
        'fail',
        user._id.toString(),
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        total: users.length,
        skipped,
        [APPLY ? 'updated' : 'wouldUpdate']: updated,
        failed,
        samples,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();

  if (SYNC) {
    await syncResidents();
  } else if (APPLY) {
    console.log('Закрытый API: npm run adapt:users -- --apply --sync');
  }
}

async function syncResidents() {
  if (!APPLY) {
    console.log('SYNC skipped: нужен --apply');
    return;
  }
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { MstyleIdentityService } =
    await import('../src/integrations/mstyle-v2/mstyle-v2.identities');
  const { AUTH_CONNECTION } =
    await import('../src/database/auth-database.constants');
  const { getModelToken } = await import('@nestjs/mongoose');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const identities = app.get(MstyleIdentityService);
    const userModel = app.get(getModelToken('User', AUTH_CONNECTION));
    const residents = await userModel.find({
      $or: [
        { role: 'tenant' },
        { parentTenantId: { $exists: true, $ne: null } },
      ],
    });
    let ok = 0;
    let fail = 0;
    for (const user of residents) {
      try {
        await identities.ensureFromUser(user);
        ok += 1;
      } catch (err) {
        fail += 1;
        console.error(
          'sync fail',
          String(user._id),
          err instanceof Error ? err.message : err,
        );
      }
    }
    console.log(JSON.stringify({ syncResidents: residents.length, ok, fail }));
  } finally {
    await app.close();
  }
}

adaptUsers().catch((err) => {
  console.error(err);
  process.exit(1);
});
