import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ไม่พบหน้าอันดับ — SQL Quick Quiz",
  robots: { index: false, follow: false },
};

/** proxy.ts rewrite มาที่นี่พร้อมสถานะ 404 เมื่อ token ของ /r/[token] ไม่ถูกต้องหรือยังไม่ประกาศผล */
export default function RankingMissing() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="card w-full max-w-sm text-center">
        <h1 className="text-xl font-semibold">ไม่พบหน้าอันดับนี้</h1>
        <p className="mt-2 text-foreground/70">ลิงก์อาจไม่ถูกต้อง หรือโจทย์ข้อนี้ยังไม่ประกาศผล</p>
      </div>
    </main>
  );
}
