import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (env.VITE_API_MODE && !['api', 'mock'].includes(env.VITE_API_MODE))
    throw new Error('VITE_API_MODE must be api or mock.');
  if (command === 'build' && env.VITE_API_MODE === 'mock')
    throw new Error('Mock authentication cannot be built for production.');
  return {
    plugins: [react()],
    // Existing feature styles share global selectors; retain a single eager cascade.
    build: { cssCodeSplit: false },
    server: { proxy: { '/api': 'http://localhost:3000' } },
  };
});
