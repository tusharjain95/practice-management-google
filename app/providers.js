'use client';

// Client-only context wrapper. QueryClient is created once at module load.

import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

export function Providers({ children }) {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => {
          for (const registration of registrations) {
            registration.unregister()
              .then((success) => {
                if (success) {
                  console.log('[ServiceWorker] Unregistered stale service worker successfully.');
                }
              })
              .catch((err) => {
                console.error('[ServiceWorker] Failed to unregister service worker:', err);
              });
          }
        })
        .catch((err) => {
          console.error('[ServiceWorker] Error getting registrations:', err);
        });
    }
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

