import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Nav } from './components/Nav';
import { ServiceWorkerRegistrar } from './components/ServiceWorkerRegistrar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Family Chore Tracker',
  description: 'Snap a photo to check the room is tidy.',
  icons: {
    icon: '/icon.svg',
    // iOS home-screen install needs a raster apple-touch-icon (it ignores SVG).
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0ea5e9',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="app-header">
          <h1 className="app-title">🧹 Chore Tracker</h1>
          <Nav />
        </header>
        <main className="app-main">{children}</main>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
