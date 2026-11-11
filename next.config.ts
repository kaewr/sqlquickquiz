import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // เทสต์โหมด polling รัน dev server ตัวที่สองด้วยโฟลเดอร์ build แยก
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  // ห้ามฝังหน้าเว็บใน iframe (กัน clickjacking ปุ่มให้คะแนน/ประกาศ/ลบ) + header พื้นฐาน
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
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
