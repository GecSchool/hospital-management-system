import type { ReactNode } from 'react';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

/** Text-first status uses Foundation semantic colors; no unverified pill variant. */
export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: StatusTone;
  children: ReactNode;
}) {
  return <span className={`ui-status ui-status--${tone}`}>{children}</span>;
}
