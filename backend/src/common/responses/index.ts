import type { Response } from 'express';

export function sendData(res: Response, data: unknown, status = 200, meta: unknown = null): void {
  res.status(status).json({ data, meta });
}
