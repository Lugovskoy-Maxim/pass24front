import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection, Model, createConnection } from 'mongoose';
import { MstyleConsentService } from './mstyle-v2.consent.service';
import { MstyleContactSelectionService } from './mstyle-v2.contact-selection';
import { MstyleV2Config } from './mstyle-v2.config';
import { encryptJson } from './mstyle-v2.crypto';
import { MstyleEventsService } from './mstyle-v2.events';
import { MstylePrivateDataService } from './mstyle-v2.private-data.service';
import {
  MstyleChangeEvent,
  MstyleChangeEventSchema,
  MstyleContact,
  MstyleContactAssignment,
  MstyleGuestContact,
  MstyleGuestParty,
  MstyleIdentity,
  MstyleIdentitySchema,
  MstyleMembership,
  MstyleMembershipSchema,
  MstylePrivateData,
  MstylePrivateDataSchema,
  MstyleProfile,
  MstyleProfileSchema,
  MstyleSequenceCounter,
  MstyleSequenceCounterSchema,
  MstyleSnapshot,
  MstyleSnapshotBinding,
} from './mstyle-v2.schemas';

const mongoUri = process.env.MSTYLE_RG01_MONGO_URI;
const describeMongo = mongoUri ? describe : describe.skip;

describeMongo('Mstyle private-data Mongo transaction atomicity', () => {
  jest.setTimeout(30_000);

  const profileId = 'prf_rg01_atomicity';
  const subject = 'usr_rg01_atomicity';
  const secret = '11'.repeat(32);
  const values = {
    company: {
      fullName: 'Synthetic Mongo atomicity company',
      inn: '0'.repeat(10),
      ogrn: '0'.repeat(13),
    },
  };

  let connection: Connection;
  let moduleRef: TestingModule;
  let service: MstylePrivateDataService;
  let eventsService: MstyleEventsService;

  let profiles: Model<MstyleProfile>;
  let privateData: Model<MstylePrivateData>;
  let identities: Model<MstyleIdentity>;
  let memberships: Model<MstyleMembership>;
  let events: Model<MstyleChangeEvent>;
  let counters: Model<MstyleSequenceCounter>;

  let failProfileSave = false;

  beforeAll(async () => {
    if (!mongoUri) {
      throw new Error('MSTYLE_RG01_MONGO_URI is required');
    }

    connection = await createConnection(mongoUri, {
      dbName: 'mstyle_rg01_atomicity',
      serverSelectionTimeoutMS: 10_000,
    }).asPromise();

    connection.base.set('transactionAsyncLocalStorage', true);

    const profileSchema = MstyleProfileSchema.clone();
    profileSchema.pre('save', function () {
      if (failProfileSave && !this.isNew) {
        throw new Error('injected-profile-save');
      }
    });

    profiles = connection.model(MstyleProfile.name, profileSchema);
    privateData = connection.model(
      MstylePrivateData.name,
      MstylePrivateDataSchema.clone(),
    );
    identities = connection.model(
      MstyleIdentity.name,
      MstyleIdentitySchema.clone(),
    );
    memberships = connection.model(
      MstyleMembership.name,
      MstyleMembershipSchema.clone(),
    );
    events = connection.model(
      MstyleChangeEvent.name,
      MstyleChangeEventSchema.clone(),
    );
    counters = connection.model(
      MstyleSequenceCounter.name,
      MstyleSequenceCounterSchema.clone(),
    );

    moduleRef = await Test.createTestingModule({
      providers: [
        MstylePrivateDataService,
        MstyleEventsService,
        {
          provide: MstyleV2Config,
          useValue: { piiSecret: () => secret },
        },
        { provide: getModelToken(MstyleProfile.name), useValue: profiles },
        {
          provide: getModelToken(MstylePrivateData.name),
          useValue: privateData,
        },
        { provide: getModelToken(MstyleIdentity.name), useValue: identities },
        {
          provide: getModelToken(MstyleMembership.name),
          useValue: memberships,
        },
        { provide: getModelToken(MstyleChangeEvent.name), useValue: events },
        {
          provide: getModelToken(MstyleSequenceCounter.name),
          useValue: counters,
        },
        { provide: getModelToken(MstyleSnapshot.name), useValue: {} },
        {
          provide: getModelToken(MstyleSnapshotBinding.name),
          useValue: {},
        },
        { provide: getModelToken(MstyleContact.name), useValue: {} },
        {
          provide: getModelToken(MstyleContactAssignment.name),
          useValue: {},
        },
        { provide: getModelToken(MstyleGuestParty.name), useValue: {} },
        { provide: getModelToken(MstyleGuestContact.name), useValue: {} },
        { provide: MstyleContactSelectionService, useValue: {} },
        { provide: MstyleConsentService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(MstylePrivateDataService);
    eventsService = moduleRef.get(MstyleEventsService);
  });

  beforeEach(async () => {
    failProfileSave = false;
    jest.restoreAllMocks();

    await Promise.all([
      profiles.deleteMany({}),
      privateData.deleteMany({}),
      identities.deleteMany({}),
      memberships.deleteMany({}),
      events.deleteMany({}),
      counters.deleteMany({}),
    ]);

    await profiles.create({
      profileId,
      type: 'company',
      legalForm: 'ooo',
      status: 'active',
      label: 'RG-01 atomicity profile',
      companyShortName: null,
      companyName: null,
      revision: 1,
      privateDataRevision: 1,
      privateDataComplete: true,
    });
    await privateData.create({
      partyType: 'resident_profile',
      partyId: profileId,
      profileType: 'company',
      legalForm: 'ooo',
      revision: 1,
      editPolicy: 'request_only',
      valuesEnc: encryptJson(secret, values),
    });
    await identities.create({
      subject,
      identityStatus: 'active',
      authVersion: 1,
      revision: 1,
      contextRevision: 1,
      displayName: 'RG-01 owner',
    });
    await memberships.create({
      membershipId: 'mem_rg01_atomicity',
      subject,
      profileId,
      role: 'owner',
      status: 'active',
      revision: 1,
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (connection) {
      await connection.dropDatabase();
    }
    if (moduleRef) {
      await moduleRef.close();
    }
    if (connection) {
      await connection.close();
    }
  });

  async function state() {
    const [doc, profile, identity, eventRows, counter] = await Promise.all([
      privateData
        .findOne({ partyType: 'resident_profile', partyId: profileId })
        .lean(),
      profiles.findOne({ profileId }).lean(),
      identities.findOne({ subject }).lean(),
      events.find({ profileId }).sort({ sequence: 1 }).lean(),
      counters.findOne({ name: 'changes' }).lean(),
    ]);

    return {
      policy: doc?.editPolicy,
      privateRevision: doc?.revision,
      profilePrivateRevision: profile?.privateDataRevision,
      contextRevision: identity?.contextRevision,
      events: eventRows.map((row) => ({
        type: row.type,
        revision: row.aggregate.revision,
      })),
      counter: counter?.value ?? 0,
    };
  }

  it('rolls back a real private-data write when profile save fails, then retries safely', async () => {
    failProfileSave = true;

    await expect(
      service.setAdminResidentSelfService(profileId, true),
    ).rejects.toThrow('injected-profile-save');

    expect(await state()).toEqual({
      policy: 'request_only',
      privateRevision: 1,
      profilePrivateRevision: 1,
      contextRevision: 1,
      events: [],
      counter: 0,
    });

    failProfileSave = false;
    await service.setAdminResidentSelfService(profileId, true);

    expect(await state()).toEqual({
      policy: 'self_service',
      privateRevision: 2,
      profilePrivateRevision: 2,
      contextRevision: 2,
      events: [
        {
          type: 'resident_private_data.updated',
          revision: 2,
        },
      ],
      counter: 1,
    });
  });

  it('rolls back event, counter, policy and revisions when event emission fails after writing', async () => {
    const realEmit = eventsService.emit.bind(eventsService);
    const emitSpy = jest
      .spyOn(eventsService, 'emit')
      .mockImplementationOnce(async (input) => {
        await realEmit(input);
        throw new Error('injected-after-event-write');
      });

    await expect(
      service.setAdminResidentSelfService(profileId, true),
    ).rejects.toThrow('injected-after-event-write');

    expect(await state()).toEqual({
      policy: 'request_only',
      privateRevision: 1,
      profilePrivateRevision: 1,
      contextRevision: 1,
      events: [],
      counter: 0,
    });

    emitSpy.mockRestore();
    await service.setAdminResidentSelfService(profileId, true);

    expect(await state()).toEqual({
      policy: 'self_service',
      privateRevision: 2,
      profilePrivateRevision: 2,
      contextRevision: 2,
      events: [
        {
          type: 'resident_private_data.updated',
          revision: 2,
        },
      ],
      counter: 1,
    });
  });

  it('rolls back private-data edit and checkbox together when the second event fails', async () => {
    const realEmit = eventsService.emit.bind(eventsService);
    let emitCalls = 0;
    const emitSpy = jest
      .spyOn(eventsService, 'emit')
      .mockImplementation(async (input) => {
        emitCalls += 1;
        const eventId = await realEmit(input);
        if (emitCalls === 2) {
          throw new Error('injected-second-event');
        }
        return eventId;
      });

    await expect(
      service.runAdminMutation(async () => {
        await service.adminPatchResident(profileId, values, 1);
        await service.setAdminResidentSelfService(profileId, true);
      }),
    ).rejects.toThrow('injected-second-event');

    expect(await state()).toEqual({
      policy: 'request_only',
      privateRevision: 1,
      profilePrivateRevision: 1,
      contextRevision: 1,
      events: [],
      counter: 0,
    });

    emitSpy.mockRestore();
    await service.runAdminMutation(async () => {
      await service.adminPatchResident(profileId, values, 1);
      await service.setAdminResidentSelfService(profileId, true);
    });

    expect(await state()).toEqual({
      policy: 'self_service',
      privateRevision: 3,
      profilePrivateRevision: 3,
      contextRevision: 3,
      events: [
        {
          type: 'resident_private_data.updated',
          revision: 2,
        },
        {
          type: 'resident_private_data.updated',
          revision: 3,
        },
      ],
      counter: 2,
    });
  });

  it('serializes concurrent identical checkbox changes to one revision and one event', async () => {
    await Promise.all([
      service.setAdminResidentSelfService(profileId, true),
      service.setAdminResidentSelfService(profileId, true),
    ]);

    expect(await state()).toEqual({
      policy: 'self_service',
      privateRevision: 2,
      profilePrivateRevision: 2,
      contextRevision: 2,
      events: [
        {
          type: 'resident_private_data.updated',
          revision: 2,
        },
      ],
      counter: 1,
    });
  });
});
