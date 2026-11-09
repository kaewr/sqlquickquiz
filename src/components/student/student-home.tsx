import type { StudentProfile } from "@/lib/auth";
import { StudentTabs } from "@/components/student/student-tabs";
import { UserMenu } from "@/components/student/user-menu";

export function StudentHome({ profile }: { profile: StudentProfile }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="font-semibold">SQL Quick Quiz</p>
            <p className="truncate text-sm text-foreground/60" data-testid="student-name">
              {profile.student_id} · {profile.first_name} {profile.last_name}
            </p>
          </div>
          <UserMenu />
        </div>
      </header>

      {!profile.password_changed && (
        <div role="status" data-testid="password-banner" className="border-b border-warning-border bg-warning-bg">
          <p className="mx-auto max-w-3xl px-4 py-2 text-sm text-warning-fg">
            คุณยังใช้รหัสผ่านเริ่มต้น (รหัสนิสิต) แนะนำให้เปลี่ยนรหัสผ่านจากเมนู “บัญชี” → “เปลี่ยนรหัสผ่าน”
          </p>
        </div>
      )}

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        <StudentTabs />
      </main>
    </div>
  );
}
