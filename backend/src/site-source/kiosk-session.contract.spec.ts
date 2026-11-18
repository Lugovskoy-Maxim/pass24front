import { request } from '../../../frontend/src/lib/api';

describe('isolated kiosk HTTP session', () => {
  const removeItem = jest.fn();
  const location = { href: '/kiosk', pathname: '/kiosk', search: '' };
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location },
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: jest.fn(() => 'ordinary-site-token'),
        removeItem,
      },
    });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    removeItem.mockClear();
    location.href = '/kiosk';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('uses only the explicit visitor/device token, never the persistent site token', async () => {
    await request('/kiosk/status', {}, { token: 'device-token' });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer device-token',
        }),
      }),
    );
    await request('/auth/login', { method: 'POST' }, { token: null });
    const options = jest.mocked(fetch).mock.calls[1][1];
    expect(options?.headers).not.toHaveProperty('Authorization');
  });

  it('keeps a failed kiosk login on the kiosk page without modifying the ordinary session', async () => {
    jest.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Неверный пароль' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(
      request('/auth/login', { method: 'POST' }, { token: null }),
    ).rejects.toMatchObject({ status: 401 });
    expect(removeItem).not.toHaveBeenCalled();
    expect(location.href).toBe('/kiosk');
  });
});
