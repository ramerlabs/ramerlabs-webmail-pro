"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

interface LoginFormProps {
  domain: string;
}

export function LoginForm({ domain }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (pendingToken) {
        const res = await fetch("/api/auth/login/2fa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pendingToken,
            code: twoFactorCode.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Verification failed");
          return;
        }
        router.push("/mail");
        router.refresh();
        return;
      }

      let loginEmail = email.trim();
      if (!loginEmail.includes("@")) {
        loginEmail = `${loginEmail}@${domain}`;
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      if (data.requires2fa && data.pendingToken) {
        setPendingToken(data.pendingToken);
        setTwoFactorCode("");
        return;
      }

      router.push(data.isAppAdmin ? "/admin" : "/mail");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {!pendingToken ? (
        <>
          <div>
            <label htmlFor="email" className="field-label">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="text"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field-input mt-1.5"
              placeholder={`you@${domain}`}
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="password" className="field-label">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-[var(--accent)] hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field-input mt-1.5"
              placeholder="Your mailbox password"
            />
          </div>
        </>
      ) : (
        <div>
          <p className="mb-3 text-sm text-[var(--muted-strong)]">
            Enter the 6-digit code from your authenticator app, or a backup
            login code.
          </p>
          <label htmlFor="twoFactorCode" className="field-label">
            Authentication code
          </label>
          <input
            id="twoFactorCode"
            name="twoFactorCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={twoFactorCode}
            onChange={(e) => setTwoFactorCode(e.target.value)}
            className="field-input mt-1.5"
            placeholder="123456 or XXXX-XXXX-XXXX"
            autoFocus
          />
          <button
            type="button"
            className="mt-2 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
            onClick={() => {
              setPendingToken(null);
              setTwoFactorCode("");
              setError(null);
            }}
          >
            ← Back to password
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading
          ? pendingToken
            ? "Verifying…"
            : "Signing in…"
          : pendingToken
            ? "Verify and sign in"
            : "Sign in"}
      </button>

      <p className="text-center text-sm text-[var(--muted)]">
        Need a mailbox?{" "}
        <Link
          href="/signup"
          className="font-medium text-[var(--accent)] hover:underline"
        >
          Create one
        </Link>
      </p>
    </form>
  );
}
