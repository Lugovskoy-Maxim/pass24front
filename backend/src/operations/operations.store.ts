import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ClientSession } from 'mongodb';
import { fail, fingerprint, OperationsActor, sqlNow } from './operations.rules';

/** All operational writes use one Mongo session, including the command receipt. */
@Injectable()
export class OperationsStore implements OnModuleInit {
  constructor(@InjectConnection() readonly connection: Connection) {}
  collection(name: string) {
    return this.connection.db!.collection<any>('mstyle_ops_' + name);
  }
  canonical(name: string) {
    return this.connection.db!.collection<any>('mstyle_v2_' + name);
  }
  async onModuleInit() {
    for (const name of [
      'bookings',
      'tickets',
      'messages',
      'attachments',
      'payments',
      'invoices',
      'events',
      'hours_ledger',
    ]) {
      await this.collection(name).createIndex({ id: 1 }, { unique: true });
      await this.collection(name).createIndex(
        { source_key: 1 },
        { unique: true, sparse: true },
      );
    }
    await this.collection('bookings').createIndex({
      room_id: 1,
      'segments.date': 1,
      status: 1,
    });
    await this.collection('bookings').createIndex({
      owner_subject: 1,
      created_at: -1,
    });
    await this.collection('bookings').createIndex({
      profile_id: 1,
      created_at: -1,
    });
    await this.collection('tickets').createIndex({
      owner_subject: 1,
      last_message_at: -1,
    });
    await this.collection('messages').createIndex({ request_id: 1, id: 1 });
    await this.collection('hours_accounts').createIndex(
      { resource_profile_id: 1 },
      { unique: true },
    );
    await this.collection('hours_ledger').createIndex({
      resource_profile_id: 1,
      id: -1,
    });
    await this.collection('hours_ledger').createIndex({ booking_id: 1, id: 1 });
    await this.collection('commands').createIndex({ key: 1 }, { unique: true });
    await this.collection('room_days').createIndex(
      { room_id: 1, date: 1 },
      { unique: true },
    );
    await this.collection('payment_intents').createIndex(
      { booking_id: 1 },
      { unique: true },
    );
    await this.collection('outbox').createIndex({ key: 1 }, { unique: true });
    await this.collection('outbox').createIndex({ state: 1, retry_at: 1 });
    await this.collection('settings').updateOne(
      { key: 'ownership' },
      { $setOnInsert: { key: 'ownership', mode: 'mstyle', generation: 1 } },
      { upsert: true },
    );
  }
  async ownership(session?: ClientSession) {
    return this.collection('settings').findOne(
      { key: 'ownership' },
      { session },
    );
  }
  async assertWritable(session: ClientSession) {
    // Updating the fence makes cutover/pause conflict with every in-flight write.
    const state = await this.collection('settings').findOneAndUpdate(
      { key: 'ownership', mode: 'pass' },
      { $inc: { write_serial: 1 } },
      { session, returnDocument: 'after' },
    );
    if (!state)
      fail(
        'maintenance',
        'Приём изменений временно приостановлен. Повторите позже.',
        503,
      );
  }
  async transaction<T>(
    run: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    try {
      return (await session.withTransaction(() => run(session), {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      })) as T;
    } finally {
      await session.endSession();
    }
  }
  async receipt(
    actor: OperationsActor,
    key: string,
    operation: string,
    payload: unknown,
  ) {
    if (!/^[A-Za-z0-9_.:-]{8,200}$/.test(key || ''))
      fail('idempotency_required', 'Не указан ключ операции.', 400);
    const prior = await this.collection('commands').findOne({
      key: actor.ref + ':' + key,
    });
    if (prior && prior.fingerprint !== fingerprint({ operation, payload }))
      fail(
        'idempotency_conflict',
        'Ключ операции уже использован с другими данными.',
      );
    return prior;
  }
  async command<T>(
    actor: OperationsActor,
    key: string,
    operation: string,
    payload: unknown,
    run: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    if (!/^[A-Za-z0-9_.:-]{8,200}$/.test(key || ''))
      fail('idempotency_required', 'Не указан ключ операции.', 400);
    const scoped = actor.ref + ':' + key;
    const hash = fingerprint({ operation, payload });
    const execute = () =>
      this.transaction(async (session) => {
        const existing = await this.collection('commands').findOne(
          { key: scoped },
          { session },
        );
        if (existing) {
          if (existing.fingerprint !== hash)
            fail(
              'idempotency_conflict',
              'Ключ операции уже использован с другими данными.',
            );
          return existing.result as T;
        }
        await this.assertWritable(session);
        const result = await run(session);
        await this.collection('commands').insertOne(
          {
            key: scoped,
            fingerprint: hash,
            operation,
            result,
            created_at: sqlNow(),
          },
          { session },
        );
        return result;
      });
    try {
      return await execute();
    } catch (e) {
      if ((e as any)?.code === 11000) return execute();
      throw e;
    }
  }
  async nextId(name: string, session?: ClientSession): Promise<number> {
    const counter = await this.collection('counters').findOneAndUpdate(
      { _id: name },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: 'after', session },
    );
    return counter!.value;
  }
  async event(
    entity: string,
    id: number | string,
    action: string,
    actor: OperationsActor,
    details: Record<string, unknown>,
    session: ClientSession,
  ) {
    await this.collection('events').insertOne(
      {
        id: await this.nextId('events', session),
        entity,
        entity_id: id,
        action,
        actor_ref: actor.ref,
        actor_label: actor.name || actor.ref,
        details,
        created_at: sqlNow(),
      },
      { session },
    );
  }
  async enqueue(
    key: string,
    type: string,
    payload: any,
    session: ClientSession,
  ) {
    await this.collection('outbox').updateOne(
      { key },
      {
        $setOnInsert: {
          key,
          type,
          payload,
          state: 'pending',
          attempts: 0,
          retry_at: new Date(),
          created_at: sqlNow(),
        },
      },
      { upsert: true, session },
    );
  }
}
