export function resolveApiMode(
  isDevelopment: boolean,
  value: string | undefined,
): 'api' | 'mock' {
  if (
    value !== undefined &&
    value !== '' &&
    value !== 'api' &&
    value !== 'mock'
  )
    throw new Error('VITE_API_MODE must be api or mock.');
  if (value === 'mock' && !isDevelopment)
    throw new Error('Mock authentication is disabled outside development.');
  return isDevelopment && value === 'mock' ? 'mock' : 'api';
}
export const apiMode = resolveApiMode(
  import.meta.env.DEV,
  import.meta.env.VITE_API_MODE,
);
