import { Suspense } from "react";
import { AdminGate } from "@/components/admin/admin-gate";
import { StudentsManager, type StudentListItem } from "@/components/admin/students-manager";
import { createClient } from "@/lib/supabase/server";

export default function StudentsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-foreground/60">กำลังโหลด…</p>}>
      <AdminGate>
        <StudentsData />
      </AdminGate>
    </Suspense>
  );
}

type ProfileRow = Omit<StudentListItem, "submission_count"> & { submissions: { count: number }[] };

/** อ่านด้วย session ของอาจารย์ (RLS อนุญาตเพราะ is_instructor) ไม่ใช้ service key */
async function StudentsData() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, student_id, first_name, last_name, section, password_changed, is_active, submissions(count)")
    .order("section")
    .order("student_id")
    .range(0, 4999)
    .overrideTypes<ProfileRow[], { merge: false }>();

  if (error) return <p className="alert alert-error">โหลดรายชื่อไม่สำเร็จ: {error.message}</p>;

  const students: StudentListItem[] = (data ?? []).map(({ submissions, ...p }) => ({
    ...p,
    submission_count: submissions?.[0]?.count ?? 0,
  }));

  return <StudentsManager students={students} />;
}
