/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Camera photos arrive as multipart FormData in a Server Action; a phone JPEG
    // (2–5 MB, and ~33% larger once read as base64) blows past Next's 1 MB default
    // Server Action body limit. This is temporary headroom for the in-memory
    // tracer — the deferred Supabase slice moves uploads to direct-to-Storage and
    // removes large bodies from the action path entirely.
    serverActions: { bodySizeLimit: '8mb' },
  },
  async headers() {
    return [
      {
        // The service worker must never be cached by the browser, so a new
        // version is picked up on the next load; serve it with the right MIME and
        // allow it to control the whole origin.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
