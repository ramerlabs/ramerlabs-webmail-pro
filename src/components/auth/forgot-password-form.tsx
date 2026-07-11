"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

interface ForgotPasswordFormProps {
  domain: string;
}

export function ForgotPasswordForm({ domain }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      let mailbox = email.trim();
      if (!mailbox.includes("@")) {
        mailbox = `${mailbox}@${domain}`;
      }
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: mailbox }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Request failed");
        return;
      }
      setMessage(
        data.message ||
          "If that mailbox has a recovery email on file, we sent a reset link.",
      );
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label htmlFor="email" className="field-label">
          Mailbox or recovery email
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
          placeholder={`you@${domain} or you@gmail.com`}
        />
        <p className="mt-1.5 text-xs text-[var(--muted)]">
          Enter your <strong>@{domain}</strong> mailbox, or the personal
          recovery email saved in Settings. We’ll send the reset link to that
          recovery address.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center text-sm text-[var(--muted)]">
        <Link
          href="/login"
          className="font-medium text-[var(--accent)] hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
