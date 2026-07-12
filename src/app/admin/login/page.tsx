import { Shield } from "lucide-react";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import {
  ensureDefaultAppAdmin,
  getDefaultAdminEmail,
} from "@/lib/app-admin";
import { requireAdminAccess } from "@/lib/session";

export default async function AdminLoginPage() {
  await ensureDefaultAppAdmin();
  const session = await requireAdminAccess();
  if (session) {
    redirect("/admin");
  }

  const adminEmail = getDefaultAdminEmail();

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] text-white">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <p className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
              RamerLabs
            </p>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              Webmail Pro · Admin
            </p>
          </div>
        </div>

        <h1 className="mb-1 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          Admin sign in
        </h1>
        <p className="mb-6 text-sm text-[var(--muted)]">
          Sign in with your installer admin account to manage license, install
          settings, and mailboxes.
        </p>

        <AdminLoginForm defaultEmail={adminEmail} />
      </div>
    </div>
  );
}
