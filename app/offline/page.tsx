import type { Metadata } from 'next';
import { OfflineCapture } from '../components/OfflineCapture';
import { QueueStatus } from '../components/QueueStatus';

export const metadata: Metadata = { title: 'Offline · Chore Tracker' };

/**
 * The offline fallback the service worker serves for navigations when the network
 * is unreachable (`public/sw.js`). Deliberately static + auth-free so it precaches
 * cleanly at SW install. A child can still capture a room photo here — the bytes are
 * queued on-device (`OfflineCapture`) and delivered automatically once back online
 * (`QueueStatus` drains them); the verdict can't be computed offline (judging needs
 * the network), so it lands in history on sync.
 */
export default function OfflinePage() {
  return (
    <div className="stack">
      <div className="notice">
        <h2>You’re offline</h2>
        <p className="muted">
          The AI check needs a connection, but you can still snap your room now — we’ll
          check it automatically the moment you’re back online.
        </p>
      </div>
      <QueueStatus />
      <OfflineCapture />
    </div>
  );
}
