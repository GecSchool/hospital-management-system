import { AppError } from '../errors/index.js';
import { validateDate } from './time.js';

type Cursor = { at: string; id: string };
const invalid = () => new AppError(400, 'VALIDATION_ERROR', '커서가 올바르지 않습니다.');

function validate(value: unknown): Cursor {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('at' in value) ||
    !('id' in value) ||
    typeof value.at !== 'string' ||
    typeof value.id !== 'string' ||
    !value.id ||
    value.id.length > 256 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.at) ||
    !Number.isFinite(Date.parse(value.at))
  )
    throw invalid();
  try {
    validateDate(value.at.slice(0, 10));
  } catch {
    throw invalid();
  }
  return { at: value.at, id: value.id };
}

export function encodeCursor(value: Cursor): string {
  return Buffer.from(JSON.stringify(validate(value))).toString('base64url');
}

export function decodeCursor(value: string): Cursor {
  if (!/^[A-Za-z0-9_-]{1,1024}$/.test(value)) throw invalid();
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value) throw invalid();
    return validate(JSON.parse(bytes.toString('utf8')));
  } catch {
    throw invalid();
  }
}
