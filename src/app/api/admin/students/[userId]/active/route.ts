import { NextResponse, type NextRequest } from "next/server";
import { requireInstructor } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { BAN_FOREVER, findStudent } from "@/lib/admin-students";

/** ปิด/เปิดบัญชี: is_active + ban ใน Supabase Auth (ล็อกอิน/ต่อ session ไม่ได้) */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/admin/students/[userId]/active">) {
  const auth = await requireInstructor();
  if (!auth.ok) return auth.error;

  const body = await request.json().catch(() => null);
  if (typeof body?.active !== "boolean") return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const active: boolean = body.active;

  const { userId } = await ctx.params;
  const student = await findStudent(userId);
  if (!student) return NextResponse.json({ error: "STUDENT_NOT_FOUND" }, { status: 404 });

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : BAN_FOREVER });
  if (error) return NextResponse.json({ error: error.code ?? "AUTH_ERROR" }, { status: 500 });

  const { error: dbError } = await admin.from("profiles").update({ is_active: active }).eq("user_id", userId);
  if (dbError) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
