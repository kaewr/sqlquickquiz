import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // เทสต์โหมด polling รัน dev server ตัวที่สองด้วยโฟลเดอร์ build แยก
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
