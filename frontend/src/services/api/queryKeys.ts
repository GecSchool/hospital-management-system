/** Scope all future business keys by account to avoid cross-account cache reuse.
 * Keep filters in a stable object; do not put resident numbers or note content in keys.
 */
export const queryKeys = {
  account: (accountId: string) => ['account', accountId] as const,
  resource: (accountId: string, resource: string) =>
    ['account', accountId, resource] as const,
};
