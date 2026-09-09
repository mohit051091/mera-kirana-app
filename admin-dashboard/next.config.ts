import type { NextConfig } from "next";

// API proxy: browser calls same-origin /api/*, Next forwards to the backend.
// This runs server-side per request, so it reads RUNTIME env — no rebuild
// needed when the backend URL changes (NEXT_PUBLIC_* baking was the old bug).
const API_BASE =
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "https://khandelwalktm.up.railway.app/api";

const nextConfig: NextConfig = {
    async rewrites() {
        return [
            {
                source: "/api/:path*",
                destination: `${API_BASE}/:path*`,
            },
        ];
    },
};

export default nextConfig;
