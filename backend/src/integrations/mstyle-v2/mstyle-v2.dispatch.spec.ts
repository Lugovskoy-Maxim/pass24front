import { MstyleIdempotencyService } from './mstyle-v2.idempotency';
import { MstyleResult, ProblemException } from './mstyle-v2.problem';

describe('durable dispatch reservation', () => {
  const input = {
    clientId: 'client',
    idempotencyKey: 'request',
    method: 'POST',
    route: '/auth/residents/code-challenges',
    body: { channel: 'email' },
  };
  function fixture() {
    let row: any;
    const rows: any = {
      findOne: async () => row || null,
      create: async (value: any) => {
        if (row) throw Object.assign(new Error('duplicate'), { code: 11000 });
        row = { ...value };
        return row;
      },
      updateOne: async (_filter: any, update: any) => {
        Object.assign(row, update.$set);
        return { modifiedCount: 1 };
      },
    };
    return {
      service: new MstyleIdempotencyService(rows, {
        idempotencySecret: () => 'dispatch-test-secret',
      } as any),
      row: () => row,
      rows,
    };
  }
  it('returns the actual saved result on replay without dispatching a second code', async () => {
    const f = fixture();
    const run = jest.fn(
      async () =>
        new MstyleResult({ challengeId: 'ach_test', optional: undefined }, 202),
    );
    await f.service.executeDispatch(input, run);
    expect(f.row().statusCode).toBe(202);
    expect((await f.service.executeDispatch(input, run)).body).toEqual({
      challengeId: 'ach_test',
    });
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('reports a concurrent unfinished send and returns its result after completion', async () => {
    const f = fixture();
    let finish!: () => void;
    const wait = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const run = jest.fn(async () => {
      entered();
      await wait;
      return new MstyleResult({ challengeId: 'ach_test' }, 202);
    });
    const first = f.service.executeDispatch(input, run);
    await started;
    await expect(f.service.executeDispatch(input, run)).rejects.toMatchObject({
      problemCode: 'UPSTREAM_UNAVAILABLE',
      retryAfter: 1,
    });
    finish();
    await first;
    expect((await f.service.executeDispatch(input, run)).status).toBe(202);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('preserves a provider failure without automatically resending', async () => {
    const f = fixture();
    const run = jest.fn(async (): Promise<MstyleResult> => {
      throw new ProblemException(503, 'UPSTREAM_UNAVAILABLE');
    });
    await expect(f.service.executeDispatch(input, run)).rejects.toThrow();
    await expect(f.service.executeDispatch(input, run)).rejects.toMatchObject({
      problemCode: 'UPSTREAM_UNAVAILABLE',
      retryable: false,
    });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
