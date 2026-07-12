import Link from "next/link";
import { Mail } from "lucide-react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/lib/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  try {
    const session = await getSession();
    if (session.isLoggedIn && session.email) {
      redirect("/mail");
    }
  } catch {
    /* SESSION_SECRET may be unset during first boot */
  }

  const domain = process.env.MAIL_DOMAIN || "mydomain.com";
  const params = await searchParams;
  const justReset = params.reset === "1";

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] text-white">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <p className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
              RamerLabs
            </p>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              Webmail
            </p>
          </div>
        </div>

        <h1 className="mb-1 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          Welcome back
        </h1>
        <p className="mb-6 text-sm text-[var(--muted)]">
          Sign in to manage your @{domain} email accounts and mailbox.
        </p>

        {justReset && (
          <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Password updated. Sign in with your new password.
          </p>
        )}

        <LoginForm domain={domain} />

        <p className="mt-6 text-center text-xs text-[var(--muted)]">
          <Link href="/signup" className="hover:text-[var(--foreground)]">
            Create a mailbox
          </Link>
        </p>
      </div>
    </div>
  );
}
