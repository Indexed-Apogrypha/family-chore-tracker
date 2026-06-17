import type { MetadataRoute } from 'next';

/**
 * Web app manifest → an installable, standalone PWA shell (PRD: "mobile-first
 * PWA"). Paired with the offline service worker (`public/sw.js`, registered by
 * `ServiceWorkerRegistrar`): the installed app opens offline to the `/offline`
 * fallback and serves hashed static assets from cache. Offline *submission*
 * (queue + replay) is a deliberate non-goal — judging needs the network.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Family Chore Tracker',
    short_name: 'Chores',
    description: 'Snap a photo to check the room is tidy.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0ea5e9',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
