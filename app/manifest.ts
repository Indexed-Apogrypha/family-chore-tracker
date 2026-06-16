import type { MetadataRoute } from 'next';

/**
 * Web app manifest → an installable, standalone PWA shell (PRD: "mobile-first
 * PWA"). A real offline service worker is deferred — the PRD has no offline
 * requirement for v1.
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
