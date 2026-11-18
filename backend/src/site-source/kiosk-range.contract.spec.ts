import { kioskRangeFree } from '../../../frontend/src/lib/kiosk';

describe('kiosk booking range', () => {
  const free = (start: number, end: number) => ({
    start_minute: start,
    end_minute: end,
    state: 'free',
  });
  it('requires exact contiguous free slots, rejecting overlaps, gaps and occupied slots', () => {
    expect(kioskRangeFree([free(600, 630), free(630, 660)], 600, 660)).toBe(
      true,
    );
    expect(kioskRangeFree([free(600, 630), free(660, 690)], 600, 690)).toBe(
      false,
    );
    expect(
      kioskRangeFree(
        [free(600, 630), { ...free(630, 660), state: 'busy' }],
        600,
        660,
      ),
    ).toBe(false);
    expect(kioskRangeFree([free(600, 630)], 610, 630)).toBe(false);
    expect(kioskRangeFree([free(600, 630)], 600, 640)).toBe(false);
    expect(kioskRangeFree([], 600, 630)).toBe(false);
    expect(kioskRangeFree([free(600, 630)], 600, 600)).toBe(false);
  });
});
