import { describe, expect, it } from 'vitest';
import {
  createResidentNumberProtector,
  loadResidentNumberProtector,
  parseResidentNumber,
} from './resident-number.js';

const encryptKey = Buffer.alloc(32, 1);
const lookupKey = Buffer.alloc(32, 2);

describe('주민등록번호 보호', () => {
  it('구분자를 정규화하고 생년월일을 구한다', () => {
    expect(parseResidentNumber('900101-1234567')).toEqual({
      normalized: '9001011234567',
      birthDate: '1990-01-01',
    });
    expect(parseResidentNumber('0002293234567').birthDate).toBe('2000-02-29');
  });

  it('마스킹 값과 잘못된 날짜 및 형식을 거부한다', () => {
    for (const value of ['900101-1******', '9002311234567', '900101123456', '900101 1234567']) {
      expect(() => parseResidentNumber(value)).toThrow();
    }
  });

  it('무작위 IV로 암호화하고 정상 값만 복호화한다', () => {
    const protector = createResidentNumberProtector(encryptKey, lookupKey);
    const first = protector.encrypt('9001011234567');
    const second = protector.encrypt('9001011234567');
    expect(first.equals(second)).toBe(false);
    expect(protector.decrypt(first)).toBe('9001011234567');
    const damaged = Buffer.from(first);
    damaged[damaged.length - 1] ^= 1;
    expect(() => protector.decrypt(damaged)).toThrow();
  });

  it('같은 정규 번호는 같은 HMAC을 갖고 다른 키는 거부한다', () => {
    const protector = createResidentNumberProtector(encryptKey, lookupKey);
    expect(protector.lookup('9001011234567')).toEqual(protector.lookup('9001011234567'));
    expect(protector.lookup('9001011234567')).not.toEqual(protector.lookup('9001021234567'));
    expect(() => createResidentNumberProtector(encryptKey, encryptKey)).toThrow();
    expect(() => createResidentNumberProtector(Buffer.alloc(12), lookupKey)).toThrow();
  });

  it('보호 키가 없거나 형식이 잘못되면 시작 설정을 거부한다', () => {
    expect(() => loadResidentNumberProtector({})).toThrow();
    expect(() =>
      loadResidentNumberProtector({
        RESIDENT_ENCRYPTION_KEY: '11'.repeat(32),
        RESIDENT_LOOKUP_KEY: 'xx',
      }),
    ).toThrow();
    expect(() =>
      loadResidentNumberProtector({
        RESIDENT_ENCRYPTION_KEY: '11'.repeat(32),
        RESIDENT_LOOKUP_KEY: '11'.repeat(32),
      }),
    ).toThrow();
  });
});
