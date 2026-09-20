import { randomBytes } from 'node:crypto';
import { MstylePrivateDataService } from './mstyle-v2.private-data.service';
import { encryptJson } from './mstyle-v2.crypto';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function fixture(policy = 'request_only') {
  const secret = randomBytes(32).toString('hex');
  const values = {
    company: {
      fullName: 'Synthetic atomicity company',
      inn: '0'.repeat(10),
      ogrn: '0'.repeat(13),
    },
  };
  const state: any = {
    profile: {
      profileId: 'prf_atomicity',
      type: 'company',
      legalForm: 'ooo',
      revision: 1,
      privateDataRevision: 1,
      privateDataComplete: true,
    },
    doc: {
      partyType: 'resident_profile',
      partyId: 'prf_atomicity',
      profileType: 'company',
      legalForm: 'ooo',
      editPolicy: policy,
      revision: 1,
      valuesEnc: encryptJson(secret, values),
    },
    contexts: 1,
    events: 0,
    fail: '',
    failEventAt: null,
  };

  let transactionDepth = 0;
  const base: any = {
    transactionAsyncLocalStorage: {
      getStore: () => (transactionDepth > 0 ? { session: {} } : undefined),
    },
    set: jest.fn(),
  };

  const snapshot = () => ({
    profile: clone(state.profile),
    doc: clone(state.doc),
    contexts: state.contexts,
    events: state.events,
  });

  const restore = (saved: any) => {
    state.profile = clone(saved.profile);
    state.doc = clone(saved.doc);
    state.contexts = saved.contexts;
    state.events = saved.events;
  };

  const db: any = {
    base,
    transaction: jest.fn(async (run: () => Promise<unknown>) => {
      const before = snapshot();
      transactionDepth += 1;
      try {
        return await run();
      } catch (error) {
        restore(before);
        throw error;
      } finally {
        transactionDepth -= 1;
      }
    }),
  };

  const hydrate = (key: 'profile' | 'doc', value: any) => ({
    ...clone(value),
    async save() {
      if (state.fail === key) {
        throw new Error(`injected-${key}`);
      }
      const stored: any = { ...this };
      delete stored.save;
      state[key] = clone(stored);
    },
  });

  const profiles: any = {
    db,
    findOne: jest.fn(async () => hydrate('profile', state.profile)),
  };
  const privateData: any = {
    db,
    findOne: jest.fn(async () => hydrate('doc', state.doc)),
    create: jest.fn(async (value: any) => {
      state.doc = clone(value);
      return hydrate('doc', value);
    }),
  };
  const events: any = {
    emit: jest.fn(async () => {
      const next = state.events + 1;
      if (state.fail === 'event' || state.failEventAt === next) {
        throw new Error('injected-event');
      }
      state.events = next;
      return `evt_${next}`;
    }),
  };
  const memberships: any = {
    find: jest.fn(async () => [{ subject: 'usr_atomicity', role: 'owner' }]),
  };
  const identities: any = {
    findOneAndUpdate: jest.fn(async () => ({
      contextRevision: ++state.contexts,
    })),
  };

  const service = new MstylePrivateDataService(
    { piiSecret: () => secret } as any,
    events,
    profiles,
    privateData,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    identities,
    memberships,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  return { service, state, snapshot, values, db };
}

describe('Mstyle private-data admin atomicity', () => {
  it('rolls back checkbox change on profile save failure and retry succeeds once', async () => {
    const f = fixture();
    const before = f.snapshot();
    f.state.fail = 'profile';

    await expect(
      f.service.setAdminResidentSelfService('prf_atomicity', true),
    ).rejects.toThrow('injected-profile');

    expect(f.snapshot()).toEqual(before);

    f.state.fail = '';
    await f.service.setAdminResidentSelfService('prf_atomicity', true);

    expect(f.state.doc.editPolicy).toBe('self_service');
    expect(f.state.doc.revision).toBe(2);
    expect(f.state.profile.privateDataRevision).toBe(2);
    expect(f.state.events).toBe(1);
  });

  it('rolls back on event failure and retry emits exactly once', async () => {
    const f = fixture();
    const before = f.snapshot();
    f.state.fail = 'event';

    await expect(
      f.service.setAdminResidentSelfService('prf_atomicity', true),
    ).rejects.toThrow('injected-event');

    expect(f.snapshot()).toEqual(before);

    f.state.fail = '';
    await f.service.setAdminResidentSelfService('prf_atomicity', true);

    expect(f.state.events).toBe(1);
    expect(f.state.profile.privateDataRevision).toBe(f.state.doc.revision);
  });

  it('rolls back private-data and checkbox together when the second event fails', async () => {
    const f = fixture();
    const before = f.snapshot();
    f.state.failEventAt = 2;

    await expect(
      f.service.runAdminMutation(async () => {
        await f.service.adminPatchResident(
          'prf_atomicity',
          f.values,
          f.state.doc.revision,
        );
        await f.service.setAdminResidentSelfService('prf_atomicity', true);
      }),
    ).rejects.toThrow('injected-event');

    expect(f.snapshot()).toEqual(before);
  });

  it('keeps repeated checkbox state as a transaction-safe no-op', async () => {
    const f = fixture('request_only');
    const before = f.snapshot();

    await expect(
      f.service.setAdminResidentSelfService('prf_atomicity', false),
    ).resolves.toEqual({
      editPolicy: 'request_only',
      revision: 1,
    });

    expect(f.snapshot()).toEqual(before);
  });
});
