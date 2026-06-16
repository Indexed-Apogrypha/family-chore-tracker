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
};

export default nextConfig;
