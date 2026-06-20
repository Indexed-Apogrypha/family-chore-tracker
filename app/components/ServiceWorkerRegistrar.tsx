'use client';

import { useEffect } from 'react';

/**
 * Registers the offline service worker (`/sw.js`) once, on the client, in
 * production only (a dev-mode SW caches stale chunks and fights HMR). Renders
 * nothing. `updateViaCache: 'none'` + the no-store header on `/sw.js`
 * (next.config) make each load re-check the worker, so updates ship promptly.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch((err) => console.error('Service worker registration failed:', err));
    };

    // Register after load so it never competes with the initial render/network.
    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
