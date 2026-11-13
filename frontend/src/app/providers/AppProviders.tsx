import { useState, type ReactNode } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { AuthProvider } from '../../features/auth/AuthProvider';
import type { AuthService } from '../../features/auth/authService';
import { createQueryClient } from './queryClient';
/** Keep non-component factories in queryClient.ts for Vite Fast Refresh. */
export function AppProviders({
  children,
  service,
  client,
}: {
  children: ReactNode;
  service?: AuthService;
  client?: QueryClient;
}) {
  const [queryClient] = useState(() => client ?? createQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider service={service}>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
