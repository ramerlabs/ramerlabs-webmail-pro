import { Mail } from "lucide-react";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { hydrateProcessEnvFromConfig } from "@/lib/app-config";
import { getPublicCaptchaConfig } from "@/lib/captcha";
import { getMailDomain } from "@/lib/env";
import { getSession } from "@/lib/session";

export default async function SignupPage() {
  try {
    await hydrateProcessEnvFromConfig();
  } catch {
    /* first boot */
  }

  try {
    const session = await getSession();
    if (session.isLoggedIn && session.email) {
      redirect("/mail");
    }
  } catch {
    /* SESSION_SECRET may be unset during first boot */
  }

  let domain = "mydomain.com";
  try {
    domain = getMailDomain();
  } catch {
    domain = process.env.MAIL_DOMAIN || "mydomain.com";
  }
  const captcha = getPublicCaptchaConfig();

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
          Create your mailbox
        </h1>
        <p className="mb-6 text-sm text-[var(--muted)]">
          Provision a real mailbox address. Signup is protected against bots.
        </p>

        <SignupForm
          domain={domain}
          captchaProvider={captcha.provider}
          captchaSiteKey={captcha.siteKey}
          captchaReady={captcha.ready}
          captchaError={captcha.error}
        />
      </div>
    </div>
  );
}
