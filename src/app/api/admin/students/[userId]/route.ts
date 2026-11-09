import { NextResponse, type NextRequest } from "next/server";
import { requireInstructor } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminRouteError } from "@/lib/admin-route";
import { findStudent } from "@/lib/admin-students";

/** ลบบัญชีนิสิต — ได้เฉพาะคนที่ยังไม่เคยส่งคำตอบ (ฐานข้อมูลบังคับด้วย on delete restrict) */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/admin/students/[userId]">) {
  const auth = await requireInstructor();
  if (!auth.ok) return auth.error;
  try {
    const { userId } = await ctx.params;
    const student = await findStudent(userId);
    if (!student) return NextResponse.json({ error: "STUDENT_NOT_FOUND" }, { status: 404 });

    const admin = createAdminClient();
    const { count } = await admin
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("student_user_id", userId);
    if ((count ?? 0) > 0) return NextResponse.json({ error: "STUDENT_HAS_SUBMISSIONS" }, { status: 409 });

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      // กรณีมีคนส่งคำตอบระหว่างนั้น FK จะปฏิเสธ
      return NextResponse.json({ error: "STUDENT_HAS_SUBMISSIONS" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adminRouteError("delete", error);
  }
}
