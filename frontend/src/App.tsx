import { BrowserRouter } from 'react-router';
import { AppProviders } from './app/providers/AppProviders';
import { AppErrorBoundary } from './app/providers/AppErrorBoundary';
import { AppRoutes } from './app/router/routes';
export default function App() {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AppProviders>
    </AppErrorBoundary>
  );
}
