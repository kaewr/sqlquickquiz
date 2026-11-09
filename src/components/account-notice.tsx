import Link from "next/link";

/** การ์ดแจ้งสถานะบัญชี (ปิดใช้งาน / ไม่มีสิทธิ์) พร้อมปุ่มออกจากระบบ */
export function AccountNotice({
  title,
  message,
  link,
  action,
  actionLabel,
}: {
  title: string;
  message: string;
  link?: { href: string; label: string };
  action: () => Promise<void>;
  actionLabel: string;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="card w-full max-w-sm text-center" role="alert">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-foreground/70">{message}</p>
        <div className="mt-6 flex flex-col gap-2">
          {link && (
            <Link href={link.href} className="btn btn-primary">
              {link.label}
            </Link>
          )}
          <form action={action}>
            <button type="submit" className="btn btn-secondary w-full">
              {actionLabel}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
