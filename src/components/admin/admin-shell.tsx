import Link from "next/link";
import { logoutToAdmin } from "@/app/actions/auth";

export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <nav className="flex items-center gap-4">
            <Link href="/admin" className="font-semibold">
              SQL Quick Quiz · อาจารย์
            </Link>
            <Link href="/admin/problems" className="text-sm text-foreground/70 hover:text-foreground">
              โจทย์
            </Link>
            <Link href="/admin/students" className="text-sm text-foreground/70 hover:text-foreground">
              นิสิต
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-sm text-foreground/60" data-testid="admin-email">
              {email}
            </span>
            <form action={logoutToAdmin}>
              <button type="submit" className="btn btn-secondary btn-sm">
                ออกจากระบบ
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
