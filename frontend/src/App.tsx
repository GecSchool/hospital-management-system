import { BrowserRouter } from 'react-router';
import { AppProviders } from './app/providers/AppProviders';
import { AppErrorBoundary } from './app/providers/AppErrorBoundary';
import { AppRoutes } from './app/router/routes';
import { PageTitle } from './app/router/PageTitle';
export default function App() {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <BrowserRouter>
          <PageTitle />
          <AppRoutes />
        </BrowserRouter>
      </AppProviders>
    </AppErrorBoundary>
  );
}
