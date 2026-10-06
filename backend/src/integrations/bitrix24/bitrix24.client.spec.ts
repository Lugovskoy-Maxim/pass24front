import { ConfigService } from '@nestjs/config';
import { Bitrix24Client, Bitrix24Error } from './bitrix24.client';

describe('Bitrix24 webhook REST contracts', () => {
  const client = (values: Record<string, string> = {}) =>
    new Bitrix24Client(
      new ConfigService({
        BITRIX_API_KEY: 'https://portal.bitrix24.ru/rest/42/test-secret/',
        ...values,
      }),
    );
  afterEach(() => jest.restoreAllMocks());
  it('discovers the service funnel through paginated categories and semantic stages', async () => {
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = new URL(String(input)),
          params = JSON.parse(init!.body as string);
        let result: any, next: number | undefined;
        if (url.pathname.endsWith('/crm.category.list.json')) {
          expect(params.entityTypeId).toBe(2);
          result = {
            categories:
              params.start === 0
                ? [{ id: 1, name: 'Продажи' }]
                : [{ id: 7, name: ' СЕРВИС ' }],
          };
          next = params.start === 0 ? 50 : undefined;
        } else {
          expect(url.pathname).toContain('/crm.status.list.json');
          expect(params.filter.ENTITY_ID).toBe('DEAL_STAGE_7');
          result = [
            {
              STATUS_ID: 'C7:WON',
              NAME: 'Готово',
              SORT: 20,
              SEMANTICS: '',
              EXTRA: { SEMANTICS: 'success' },
            },
            {
              STATUS_ID: 'C7:NEW',
              NAME: 'В работе',
              SORT: 10,
              EXTRA: { SEMANTICS: 'process' },
            },
          ];
        }
        return new Response(JSON.stringify({ result, next }));
      });
    const api = client();
    expect(await api.funnel()).toMatchObject({
      id: 7,
      initialStage: 'C7:NEW',
      stages: [{ semantic: 'process' }, { semantic: 'success' }],
    });
    await api.funnel();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('rejects ambiguous funnel names and repeated pagination offsets', async () => {
    const api = client();
    jest.spyOn(api, 'call').mockResolvedValue({
      result: {
        categories: [
          { id: 1, name: 'Сервис' },
          { id: 2, name: 'сервис' },
        ],
      },
    });
    await expect(api.funnel()).rejects.toMatchObject({
      code: 'service_funnel_ambiguous',
    });
    jest.spyOn(api, 'call').mockResolvedValue({ result: [], next: 0 });
    await expect(api.comments(77)).rejects.toMatchObject({
      code: 'pagination_invalid',
    });
  });
  it('keeps credentials out of network errors and marks uncertain writes for reconciliation', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(
        new Error('Failed URL https://portal.bitrix24.ru/rest/42/test-secret/'),
      );
    let captured: unknown;
    try {
      await client().call('crm.deal.add', { fields: {} });
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(Bitrix24Error);
    expect(captured).toMatchObject({
      code: 'connection_failed',
      uncertain: true,
    });
    expect(String(captured)).not.toContain('test-secret');
    await expect(
      client().call('crm.deal.get', { id: 77 }),
    ).rejects.toMatchObject({ uncertain: false });
    await expect(
      client({ BITRIX_API_KEY: 'only-a-secret' }).call('crm.deal.add'),
    ).rejects.toMatchObject({
      code: 'webhook_not_configured',
      uncertain: false,
    });
  });
  it('supports CRM-only scope without retrying forbidden author reads on every poll', async () => {
    const api = client();
    const request = jest
      .spyOn(api, 'call')
      .mockRejectedValue(new Bitrix24Error('insufficient_scope'));
    expect(await api.author('42')).toBe('Служба сервиса');
    expect(await api.author('42')).toBe('Служба сервиса');
    expect(await api.authorProfile('42')).toEqual({
      name: 'Служба сервиса',
      position: '',
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('reads the matching employee position, shares the name cache and refreshes changed positions', async () => {
    const api = client();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000000);
    const employee = {
      ID: '42',
      LAST_NAME: 'Иванов',
      NAME: 'Иван',
      WORK_POSITION: '  Главный\n инженер  ',
    };
    const request = jest.spyOn(api, 'call').mockResolvedValue({
      result: [
        { ID: '99', NAME: 'Другой', WORK_POSITION: 'Директор' },
        employee,
      ],
    });
    expect(await api.authorProfile('42')).toEqual({
      name: 'Иванов Иван',
      position: 'Главный инженер',
    });
    expect(await api.author('42')).toBe('Иванов Иван');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('user.get', {
      FILTER: { ID: '42' },
      select: ['ID', 'NAME', 'LAST_NAME', 'SECOND_NAME', 'WORK_POSITION'],
    });
    employee.WORK_POSITION = 'Руководитель сервиса';
    clock.mockReturnValue(1300000);
    expect((await api.authorProfile('42')).position).toBe(
      'Руководитель сервиса',
    );
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('keeps missing or unavailable positions empty instead of substituting a personal name', async () => {
    const api = client();
    const request = jest.spyOn(api, 'call').mockResolvedValue({
      result: [{ ID: '42', NAME: 'Иван', WORK_POSITION: '  ' }],
    });
    expect(await api.authorProfile('42')).toEqual({
      name: 'Иван',
      position: '',
    });
    request.mockResolvedValue({ result: [{ ID: '99', NAME: 'Другой' }] });
    expect(await api.authorProfile('43')).toEqual({
      name: 'Служба сервиса',
      position: '',
    });
  });
});
