import type { StudentProfile } from "@/lib/auth";
import { StudentTabs } from "@/components/student/student-tabs";
import { UserMenu } from "@/components/student/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { CurrentProblems } from "@/components/student/current-problems";
import { createClient } from "@/lib/supabase/server";
import { fetchCurrentProblems } from "@/lib/current-problems";

export async function StudentHome({ profile }: { profile: StudentProfile }) {
  const supabase = await createClient();
  const initial = await fetchCurrentProblems(supabase);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-t-4 border-border border-t-accent bg-background">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="font-semibold text-primary">SQL Quick Quiz</p>
            <p className="truncate text-sm text-foreground/60" data-testid="student-name">
              {profile.student_id} · {profile.first_name} {profile.last_name}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <UserMenu />
          </div>
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
        <StudentTabs current={<CurrentProblems initial={initial} />} />
      </main>
    </div>
  );
}
