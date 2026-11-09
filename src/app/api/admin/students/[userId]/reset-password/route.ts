import { NextResponse, type NextRequest } from "next/server";
import { requireInstructor } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminRouteError } from "@/lib/admin-route";
import { findStudent } from "@/lib/admin-students";

/** รีเซ็ตรหัสผ่านกลับเป็นรหัสนิสิต และให้แถบเตือนกลับมา (password_changed = false) */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/admin/students/[userId]/reset-password">) {
  const auth = await requireInstructor();
  if (!auth.ok) return auth.error;
  try {
    const { userId } = await ctx.params;
    const student = await findStudent(userId);
    if (!student) return NextResponse.json({ error: "STUDENT_NOT_FOUND" }, { status: 404 });

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(userId, { password: student.student_id });
    if (error) return NextResponse.json({ error: error.code ?? "AUTH_ERROR" }, { status: 500 });

    const { error: dbError } = await admin.from("profiles").update({ password_changed: false }).eq("user_id", userId);
    if (dbError) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return adminRouteError("reset-password", error);
  }
}
