import { Mail } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getSession } from "@/lib/session";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  try {
    const session = await getSession();
    if (session.isLoggedIn && session.email) redirect("/mail");
  } catch {
    /* ignore */
  }

  const params = await searchParams;
  const token = params.token || "";

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
          Choose a new password
        </h1>
        <p className="mb-6 text-sm text-[var(--muted)]">
          Pick a strong password for your mailbox.
        </p>

        <ResetPasswordForm token={token} />

        <p className="mt-6 text-center text-xs text-[var(--muted)]">
          <Link href="/login" className="hover:text-[var(--foreground)]">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
