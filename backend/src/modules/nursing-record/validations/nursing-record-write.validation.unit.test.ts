import { describe, expect, it } from 'vitest';
import { parseNursingCreate, parseNursingCorrection } from './nursing-record-write.validation.js';

describe('간호 기록 내용 검증', () => {
  it.each(['', '   ', '\n\t'])('빈 기록 내용 %j을 작성과 정정에서 거부한다', (content) => {
    expect(() => parseNursingCreate({ content })).toThrow();
    expect(() =>
      parseNursingCorrection({ content, baseVersionNo: 1, correctionReason: '보완' }),
    ).toThrow();
  });
  it('유효한 내용의 앞뒤 공백은 보존한다', () => {
    expect(parseNursingCreate({ content: '  환자 상태 확인  ' }).content).toBe(
      '  환자 상태 확인  ',
    );
  });
});
