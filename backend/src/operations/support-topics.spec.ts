import {
  SUPPORT_TOPICS,
  supportTopic,
  supportTopicFilter,
} from './operations.rules';
import { SERVICE_REQUEST_TOPICS } from '../site-source/site-source.dto';

describe('service request categories', () => {
  it('offers the same five categories through the native client contract', () => {
    expect(Object.values(SUPPORT_TOPICS)).toEqual([
      'Сервис',
      'IT',
      'Пропуска',
      'Доп. услуги',
      'Другое',
    ]);
    for (const key of Object.keys(SUPPORT_TOPICS))
      expect(SERVICE_REQUEST_TOPICS).toContain(key);
  });
  it('keeps older website and app categories readable and accepted', () => {
    expect(supportTopic('plumbing')).toBe('service');
    expect(supportTopic('office')).toBe('service');
    expect(supportTopic('guest_pass')).toBe('passes');
    expect(supportTopic('access')).toBe('passes');
    expect(supportTopic('booking')).toBe('other');
    expect(supportTopic('services')).toBe('services');
    expect(supportTopicFilter('passes')).toEqual(
      expect.arrayContaining(['passes', 'access', 'guest_pass', 'parking']),
    );
    expect(supportTopicFilter('service')).toEqual(
      expect.arrayContaining(['service', 'office', 'plumbing', 'engineering']),
    );
  });
  it('rejects unknown and object prototype values', () => {
    expect(supportTopic('missing')).toBeUndefined();
    expect(supportTopic('constructor')).toBeUndefined();
    expect(supportTopic('__proto__')).toBeUndefined();
    expect(supportTopicFilter('missing')).toEqual([]);
  });
});
