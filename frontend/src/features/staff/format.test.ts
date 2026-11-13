import { afterEach, expect, it, vi } from 'vitest';
import { businessDate, shiftDate } from './format';
import { shiftDate as scheduleShiftDate } from '../doctor/schedule';
import { mockTimestamp, mockRecordAuthor } from '../../services/mock/utils';
import { mockAccounts } from '../../services/mock/identity';

afterEach(() => vi.useRealTimers());
it.each([
  ['2026-12-31', 1, '2027-01-01'],
  ['2027-01-01', -1, '2026-12-31'],
  ['2028-02-28', 1, '2028-02-29'],
  ['2028-03-01', -1, '2028-02-29'],
  ['2026-03-08', 1, '2026-03-09'],
])(
  'preserves business date boundaries for %s plus %s days',
  (date, days, expected) => {
    expect(shiftDate(date, days)).toBe(expected);
    expect(scheduleShiftDate(date, days)).toBe(expected);
  },
);
it('preserves Seoul midnight, millisecond precision and injectable mock clocks', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-12-31T15:00:00.123Z'));
  expect(businessDate()).toBe('2027-01-01');
  expect(mockTimestamp()).toBe('2027-01-01T00:00:00.123+09:00');
  expect(mockTimestamp(Date.parse('2026-12-31T14:59:59.999Z'))).toBe(
    '2026-12-31T23:59:59.999+09:00',
  );
});
it('snapshots only allowed author fields and retains no credentials', () => {
  const account = {
    ...structuredClone(mockAccounts.NURSE),
    password: 'synthetic-only',
    token: 'synthetic-only',
  };
  const snapshot = mockRecordAuthor(account);
  expect(snapshot).toEqual(mockAccounts.NURSE);
  expect('password' in snapshot).toBe(false);
  expect('token' in snapshot).toBe(false);
  account.department!.name = 'changed outside';
  expect(snapshot.department!.name).toBe('내과');
});
