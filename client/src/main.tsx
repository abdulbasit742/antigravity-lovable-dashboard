import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import superjson from 'superjson';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';
import type { AppRouter } from '../../server/routers';
import { notifyAuthExpired } from './session';

export const trpc = createTRPCReact<AppRouter>();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry(failureCount, error) {
        const status = (error as { data?: { httpStatus?: number } })?.data?.httpStatus;
        return status !== 401 && failureCount < 1;
      },
    },
  },
});

const trpcClient = trpc.createClient({
  transformer: superjson,
  links: [
    httpBatchLink({
      url: '/trpc',
      fetch: async (url, options) => {
        const response = await globalThis.fetch(url, { ...options, credentials: 'same-origin' });
        if (response.status === 401) notifyAuthExpired();
        return response;
      },
    }),
  ],
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Toaster position="top-right" toastOptions={{ style: { background: '#1e293b', color: '#f1f5f9' } }} />
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  </React.StrictMode>,
);
