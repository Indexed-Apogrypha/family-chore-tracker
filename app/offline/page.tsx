import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Offline · Chore Tracker' };

/**
 * The offline fallback the service worker serves for navigations when the
 * network is unreachable (`public/sw.js`). Deliberately static + auth-free so it
 * precaches cleanly at SW install and is reachable by anyone. It holds no domain
 * data — the judging flow needs the network — so it just reassures and points
 * back online.
 */
export default function OfflinePage() {
  return (
    <div className="stack">
      <div className="notice">
        <h2>You’re offline</h2>
        <p className="muted">
          Chore Tracker needs a connection to set a reference photo, submit a room
          photo, and get an AI verdict.
        </p>
        <p className="muted">
          Reconnect and reopen the page — your streak and history are waiting.
        </p>
      </div>
    </div>
  );
}
