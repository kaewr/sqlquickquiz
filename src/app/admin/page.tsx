import { Suspense } from "react";
import Link from "next/link";
import { AdminGate } from "@/components/admin/admin-gate";

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<p className="p-6 text-foreground/60">กำลังโหลด…</p>}>
      <AdminHome searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminHome({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  const { error } = await searchParams;
  return (
    <AdminGate errorCode={typeof error === "string" ? error : undefined}>
      <h1 className="text-xl font-semibold">หน้าอาจารย์</h1>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Link href="/admin/students" className="card hover:bg-muted">
          <p className="font-medium">จัดการนิสิต</p>
          <p className="mt-1 text-sm text-foreground/60">นำเข้ารายชื่อ CSV, รีเซ็ตรหัสผ่าน, ปิด/เปิดบัญชี</p>
        </Link>
      </div>
    </AdminGate>
  );
}
