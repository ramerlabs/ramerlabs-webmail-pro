"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { CaptchaWidget } from "@/components/captcha-widget";

interface SignupFormProps {
  domain: string;
  captchaProvider: "turnstile" | "recaptcha" | "none";
  captchaSiteKey: string;
  captchaReady: boolean;
  captchaError?: string;
}

export function SignupForm({
  domain,
  captchaProvider,
  captchaSiteKey,
  captchaReady,
  captchaError,
}: SignupFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [selectedDomain, setSelectedDomain] = useState(domain);
  const [domains, setDomains] = useState<string[]>([domain]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signupEnabled, setSignupEnabled] = useState<boolean | null>(null);
  const [closedMessage, setClosedMessage] = useState<string | null>(null);
  const [licenseActive, setLicenseActive] = useState(true);
  const [companyUrl, setCompanyUrl] = useState("https://ramerlabs.com");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/config/signup", { cache: "no-store" });
        const data = await res.json();
        setSignupEnabled(data.signupEnabled !== false);
        setLicenseActive(data.licenseActive !== false);
        setCompanyUrl(data.companyUrl || "https://ramerlabs.com");
        setClosedMessage(
          data.message ||
            "Build your custom webmail @yourdomain.com — contact ramerlabs.com",
        );
        const list: string[] = Array.isArray(data.domains) && data.domains.length
          ? data.domains.map((d: string) => String(d).toLowerCase())
          : [data.domain || domain].filter(Boolean);
        setDomains(list);
        setSelectedDomain((prev) =>
          list.includes(prev) ? prev : list[0] || domain,
        );
      } catch {
        setSignupEnabled(true);
        setLicenseActive(true);
      }
    })();
  }, [domain]);

  const onToken = useCallback((token: string | null) => {
    setCaptchaToken(token);
  }, []);

  const captchaRequired = captchaProvider !== "none";
  const canSubmit =
    signupEnabled === true &&
    captchaReady &&
    (!captchaRequired || Boolean(captchaToken)) &&
    !loading;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (signupEnabled === false) {
      setError(
        closedMessage ||
          "Build your custom webmail @yourdomain.com — contact ramerlabs.com",
      );
      return;
    }

    if (!captchaReady) {
      setError(captchaError || "Signup is locked until captcha is configured.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    if (!recoveryEmail.trim()) {
      setError("Recovery email is required.");
      return;
    }

    if (captchaRequired && !captchaToken) {
      setError("Please complete the security check before continuing.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          recoveryEmail: recoveryEmail.trim(),
          domain: selectedDomain,
          captchaToken: captchaToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Signup failed");
        setCaptchaToken(null);
        return;
      }
      router.push("/mail");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (signupEnabled === false) {
    const isLicenseIssue = licenseActive === false;
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4 text-sm leading-relaxed text-[var(--foreground)]">
          <p className="font-medium">
            {closedMessage ||
              (isLicenseIssue
                ? "RamerLabs Webmail Pro is not active. Please get a license key at ramerlabs.com to unlock this feature."
                : "Build your custom webmail @yourdomain.com — contact ramerlabs.com")}
          </p>
          <p className="mt-2 text-[var(--muted)]">
            {isLicenseIssue
              ? "Mailbox registration is locked until a valid license is activated in Admin."
              : "New mailbox signup is currently closed on this site."}
          </p>
          <a
            href={companyUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block font-medium text-[var(--accent)] hover:underline"
          >
            Get a license at ramerlabs.com →
          </a>
        </div>
        <p className="text-center text-sm text-[var(--muted)]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-[var(--accent)] hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  if (signupEnabled === null) {
    return (
      <p className="text-sm text-[var(--muted)]">Checking signup availability…</p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {!captchaReady && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {captchaError ||
            "Bot protection is not configured. Mailbox signup is disabled."}
        </p>
      )}

      <div>
        <label htmlFor="username" className="field-label">
          Username
        </label>
        <div className="mt-1.5 flex overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
          <input
            id="username"
            name="username"
            autoComplete="username"
            required
            minLength={3}
            maxLength={32}
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
            placeholder="you"
            disabled={!captchaReady}
          />
          {domains.length > 1 ? (
            <select
              aria-label="Email domain"
              className="max-w-[55%] border-l border-[var(--border)] bg-[var(--surface-muted)] px-2 text-sm text-[var(--foreground)] outline-none"
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
              disabled={!captchaReady}
            >
              {domains.map((d) => (
                <option key={d} value={d}>
                  @{d}
                </option>
              ))}
            </select>
          ) : (
            <span className="flex items-center border-l border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--muted)]">
              @{selectedDomain || domain}
            </span>
          )}
        </div>
        {domains.length > 1 && (
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            Choose which domain your mailbox should use.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="field-label">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field-input mt-1.5"
          placeholder="At least 8 characters"
          disabled={!captchaReady}
        />
      </div>

      <div>
        <label htmlFor="confirm" className="field-label">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="field-input mt-1.5"
          disabled={!captchaReady}
        />
      </div>

      <div>
        <label htmlFor="recoveryEmail" className="field-label">
          Recovery email
        </label>
        <input
          id="recoveryEmail"
          name="recoveryEmail"
          type="email"
          autoComplete="email"
          required
          value={recoveryEmail}
          onChange={(e) => setRecoveryEmail(e.target.value)}
          className="field-input mt-1.5"
          placeholder="you@personal-email.com"
          disabled={!captchaReady}
        />
        <p className="mt-1.5 text-xs text-[var(--muted)]">
          Used for password resets. Must be different from this mailbox.
        </p>
      </div>

      <CaptchaWidget
        provider={captchaProvider}
        siteKey={captchaSiteKey}
        onToken={onToken}
      />

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button type="submit" disabled={!canSubmit} className="btn-primary w-full">
        {loading ? "Creating mailbox…" : "Create mailbox"}
      </button>

      {captchaRequired && captchaReady && !captchaToken && (
        <p className="text-center text-xs text-[var(--muted)]">
          Complete the security check to enable signup.
        </p>
      )}

      <p className="text-center text-sm text-[var(--muted)]">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-[var(--accent)] hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
