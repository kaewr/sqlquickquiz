import { Suspense } from "react";
import { getViewer } from "@/lib/auth";
import { LoginForm } from "@/components/student/login-form";
import { StudentHome } from "@/components/student/student-home";
import { AccountNotice } from "@/components/account-notice";
import { logout } from "@/app/actions/auth";

export default function Home() {
  return (
    <Suspense fallback={<PageLoading />}>
      <StudentGate />
    </Suspense>
  );
}

async function StudentGate() {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") return <LoginForm />;

  if (viewer.kind === "student") {
    if (!viewer.profile.is_active) {
      return (
        <AccountNotice
          title="บัญชีถูกปิดใช้งาน"
          message="บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่ออาจารย์"
          action={logout}
          actionLabel="ออกจากระบบ"
        />
      );
    }
    return <StudentHome profile={viewer.profile} />;
  }

  if (viewer.kind === "instructor") {
    return (
      <AccountNotice
        title="บัญชีอาจารย์"
        message="หน้านี้สำหรับนิสิต กรุณาไปที่หน้าอาจารย์"
        link={{ href: "/admin", label: "ไปหน้าอาจารย์" }}
        action={logout}
        actionLabel="ออกจากระบบ"
      />
    );
  }

  return (
    <AccountNotice
      title="ไม่ใช่บัญชีนิสิต"
      message="บัญชีนี้ไม่ใช่บัญชีนิสิต กรุณาออกจากระบบแล้วเข้าสู่ระบบด้วยรหัสนิสิต"
      action={logout}
      actionLabel="ออกจากระบบ"
    />
  );
}

function PageLoading() {
  return (
    <main className="flex flex-1 items-center justify-center p-6 text-foreground/60">กำลังโหลด…</main>
  );
}
