import { instructorGoogleLogin } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";

export function GoogleLogin({ error }: { error?: string }) {
  return (
    <main className="relative flex flex-1 items-center justify-center px-4 py-12">
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="card w-full max-w-sm border-t-4 border-t-accent text-center">
        <h1 className="text-2xl font-bold text-primary">SQL Quick Quiz</h1>
        <p className="mt-1 text-sm text-foreground/60">เข้าสู่ระบบสำหรับอาจารย์</p>
        {error && (
          <p role="alert" className="alert alert-error mt-4">
            {error}
          </p>
        )}
        <form action={instructorGoogleLogin} className="mt-6">
          <button type="submit" className="btn btn-primary w-full">
            เข้าสู่ระบบด้วย Google
          </button>
        </form>
      </div>
    </main>
  );
}
