import { getViewer } from "@/lib/auth";
import { AccountNotice } from "@/components/account-notice";
import { AdminShell } from "@/components/admin/admin-shell";
import { GoogleLogin } from "@/components/admin/google-login";
import { logoutToAdmin } from "@/app/actions/auth";
import { thaiError } from "@/lib/errors";

/** ตรวจสิทธิ์อาจารย์ก่อนแสดงเนื้อหา (ต้องอยู่ใน <Suspense>) */
export async function AdminGate({
  children,
  errorCode,
}: {
  children: React.ReactNode;
  errorCode?: string;
}) {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") {
    return <GoogleLogin error={errorCode ? thaiError(errorCode) : undefined} />;
  }
  if (viewer.kind !== "instructor") {
    return (
      <AccountNotice
        title="ไม่มีสิทธิ์เข้าถึง"
        message="หน้านี้สำหรับอาจารย์เท่านั้น"
        link={{ href: "/", label: "กลับหน้าหลัก" }}
        action={logoutToAdmin}
        actionLabel="ออกจากระบบ"
      />
    );
  }
  return <AdminShell email={viewer.email}>{children}</AdminShell>;
}
