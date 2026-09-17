import {
  isValidRussianBik,
  isValidRussianCorrespondentAccount,
  isValidRussianSettlementAccount,
} from './mstyle-v2.bank-details';
import { MANUAL_TEST_PROFILES } from './mstyle-v2.manual-test-profiles';

describe('Russian bank details', () => {
  it('accepts every company fixture', () => {
    for (const profile of MANUAL_TEST_PROFILES.filter(
      (item) => item.type === 'company',
    )) {
      const bank = profile.privateData.bank as Record<string, string>;
      expect(isValidRussianBik(bank.bik)).toBe(true);
      expect(
        isValidRussianSettlementAccount(bank.bik, bank.accountNumber),
      ).toBe(true);
      expect(
        isValidRussianCorrespondentAccount(
          bank.bik,
          bank.correspondentAccountNumber,
        ),
      ).toBe(true);
    }
  });

  it('rejects malformed and checksum-invalid values', () => {
    expect(isValidRussianBik('04452522')).toBe(false);
    expect(
      isValidRussianSettlementAccount('044525225', '40702810500000001002'),
    ).toBe(false);
    expect(
      isValidRussianCorrespondentAccount('044525225', '30101810400000000226'),
    ).toBe(false);
  });
});
