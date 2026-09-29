import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Vercel rejects function request bodies above 4.5 MB. Wedding uploads
      // are capped at 4 MB so the multipart request stays under that limit.
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
