"use client";

import { KeyRound, Settings, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { WebmailShell } from "@/components/webmail-shell";
import type { ReplyBehavior, UserSettings } from "@/lib/settings-types";

const emptySettings: UserSettings = {
  displayName: "",
  signature: "",
  replyBehavior: "reply",
  threadedView: true,
};

export function SettingsPage({ email }: { email: string }) {
  const [settings, setSettings] = useState<UserSettings>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [backupRemaining, setBackupRemaining] = useState(0);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [setupQr, setSetupQr] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [regenCode, setRegenCode] = useState("");
  const [freshBackupCodes, setFreshBackupCodes] = useState<string[] | null>(
    null,
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  async function loadSecurity() {
    const res = await fetch("/api/security", { cache: "no-store" });
    const data = await res.json();
    if (res.ok) {
      setRecoveryEmail(data.recoveryEmail || "");
      setTotpEnabled(Boolean(data.totpEnabled));
      setBackupRemaining(Number(data.backupCodesRemaining) || 0);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const [settingsRes] = await Promise.all([
          fetch("/api/settings", { cache: "no-store" }),
          loadSecurity(),
        ]);
        const data = await settingsRes.json();
        if (settingsRes.ok && data.settings) {
          setSettings({ ...emptySettings, ...data.settings });
        }
      } catch {
        setError("Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }
      setSettings({ ...emptySettings, ...data.settings });
      setMessage("Settings saved.");
    } catch {
      setError("Network error saving settings");
    } finally {
      setSaving(false);
    }
  }

  async function securityAction(body: Record<string, unknown>) {
    setSecurityBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/security", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Security update failed");
        return null;
      }
      return data;
    } catch {
      setError("Network error updating security");
      return null;
    } finally {
      setSecurityBusy(false);
    }
  }

  async function saveRecoveryEmail() {
    const data = await securityAction({
      action: "updateRecoveryEmail",
      recoveryEmail,
    });
    if (data) {
      setMessage("Recovery email updated.");
      await loadSecurity();
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    setPasswordBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to change password");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage(
        data.message ||
          "Password updated. Use your new password next time you sign in.",
      );
    } catch {
      setError("Network error changing password");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function begin2fa() {
    const data = await securityAction({ action: "begin2fa" });
    if (!data) return;
    setSetupSecret(data.secret);
    setSetupQr(data.qrDataUrl);
    setSetupCode("");
    setFreshBackupCodes(null);
  }

  async function confirm2fa() {
    if (!setupSecret) return;
    const data = await securityAction({
      action: "confirm2fa",
      secret: setupSecret,
      code: setupCode,
    });
    if (!data) return;
    setTotpEnabled(true);
    setSetupSecret(null);
    setSetupQr(null);
    setSetupCode("");
    setFreshBackupCodes(data.backupCodes || []);
    setMessage("Two-factor authentication enabled. Save your backup codes now.");
    await loadSecurity();
  }

  async function disable2fa() {
    const data = await securityAction({
      action: "disable2fa",
      code: disableCode,
    });
    if (!data) return;
    setDisableCode("");
    setFreshBackupCodes(null);
    setMessage("Two-factor authentication disabled.");
    await loadSecurity();
  }

  async function regenerateBackupCodes() {
    const data = await securityAction({
      action: "regenerateBackupCodes",
      code: regenCode,
    });
    if (!data) return;
    setRegenCode("");
    setFreshBackupCodes(data.backupCodes || []);
    setMessage("New backup codes generated. Old codes no longer work.");
    await loadSecurity();
  }

  return (
    <WebmailShell email={email} active="settings">
      <section className="mail-reader mail-reader-full">
        <div className="border-b border-[var(--border)] px-6 py-5">
          <div className="flex items-center gap-3">
            <Settings className="h-5 w-5 text-[var(--accent)]" />
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
                Settings
              </h1>
              <p className="text-sm text-[var(--muted)]">
                Mail preferences, recovery email, and two-factor authentication
              </p>
            </div>
          </div>
        </div>

        <div className="mail-body-scroll flex-1 space-y-6 p-6">
          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : (
            <>
              <form
                onSubmit={handleSave}
                className="mx-auto max-w-xl space-y-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                <p className="text-sm font-medium">Mail preferences</p>
                <div>
                  <label className="field-label mb-1.5" htmlFor="displayName">
                    Display name
                  </label>
                  <input
                    id="displayName"
                    className="field-input"
                    value={settings.displayName}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        displayName: e.target.value,
                      }))
                    }
                    placeholder="Shown in the From header"
                  />
                </div>

                <div>
                  <label className="field-label mb-1.5" htmlFor="signature">
                    Signature
                  </label>
                  <textarea
                    id="signature"
                    className="field-input min-h-28"
                    value={settings.signature}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, signature: e.target.value }))
                    }
                    placeholder="Appended to new messages and replies"
                  />
                </div>

                <div>
                  <label className="field-label mb-1.5" htmlFor="replyBehavior">
                    Default reply behavior
                  </label>
                  <select
                    id="replyBehavior"
                    className="field-input"
                    value={settings.replyBehavior}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        replyBehavior: e.target.value as ReplyBehavior,
                      }))
                    }
                  >
                    <option value="reply">Reply to sender</option>
                    <option value="replyAll">Reply all</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-sm text-[var(--muted-strong)]">
                  <input
                    type="checkbox"
                    checked={settings.threadedView}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        threadedView: e.target.checked,
                      }))
                    }
                  />
                  Group messages into threaded conversations
                </label>

                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary"
                >
                  {saving ? "Saving…" : "Save preferences"}
                </button>
              </form>

              <div className="mx-auto max-w-xl space-y-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <KeyRound className="h-4 w-4 text-[var(--accent)]" />
                  Change password
                </p>
                <form onSubmit={handleChangePassword} className="space-y-3">
                  <div>
                    <label className="field-label mb-1.5" htmlFor="currentPassword">
                      Current password
                    </label>
                    <input
                      id="currentPassword"
                      type="password"
                      autoComplete="current-password"
                      required
                      className="field-input"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="field-label mb-1.5" htmlFor="newPassword">
                      New password
                    </label>
                    <input
                      id="newPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      className="field-input"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <label
                      className="field-label mb-1.5"
                      htmlFor="confirmPassword"
                    >
                      Confirm new password
                    </label>
                    <input
                      id="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      className="field-input"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={passwordBusy}
                  >
                    {passwordBusy ? "Updating…" : "Update password"}
                  </button>
                </form>
              </div>

              <div className="mx-auto max-w-xl space-y-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Shield className="h-4 w-4 text-[var(--accent)]" />
                  Account security
                </p>

                <div>
                  <label className="field-label mb-1.5" htmlFor="recoveryEmail">
                    Recovery email
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id="recoveryEmail"
                      type="email"
                      className="field-input"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      placeholder="you@personal-email.com"
                    />
                    <button
                      type="button"
                      className="btn-secondary shrink-0"
                      disabled={securityBusy}
                      onClick={() => void saveRecoveryEmail()}
                    >
                      Save
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--muted)]">
                    Password reset links are sent here — not to this mailbox.
                    Each recovery address can protect only one mailbox.
                  </p>
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">Two-factor authentication</p>
                      <p className="text-xs text-[var(--muted)]">
                        {totpEnabled
                          ? "Enabled — required at sign-in"
                          : "Add an authenticator app for stronger sign-in"}
                      </p>
                    </div>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        totpEnabled
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-[var(--surface)] text-[var(--muted)]"
                      }`}
                    >
                      {totpEnabled ? "On" : "Off"}
                    </span>
                  </div>

                  {!totpEnabled && !setupSecret && (
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={securityBusy}
                      onClick={() => void begin2fa()}
                    >
                      Enable 2FA
                    </button>
                  )}

                  {setupSecret && (
                    <div className="space-y-3">
                      {setupQr && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={setupQr}
                          alt="Authenticator QR code"
                          className="rounded-lg border border-[var(--border)] bg-white p-2"
                          width={180}
                          height={180}
                        />
                      )}
                      <p className="break-all text-xs text-[var(--muted)]">
                        Or enter this key manually:{" "}
                        <code className="text-[var(--foreground)]">
                          {setupSecret}
                        </code>
                      </p>
                      <input
                        className="field-input"
                        placeholder="6-digit code"
                        value={setupCode}
                        onChange={(e) => setSetupCode(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={securityBusy}
                          onClick={() => void confirm2fa()}
                        >
                          Confirm and enable
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => {
                            setSetupSecret(null);
                            setSetupQr(null);
                            setSetupCode("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {totpEnabled && (
                    <div className="space-y-4">
                      <div>
                        <p className="mb-2 text-xs text-[var(--muted)]">
                          Backup codes remaining: {backupRemaining}
                        </p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            className="field-input"
                            placeholder="Authenticator code to regenerate"
                            value={regenCode}
                            onChange={(e) => setRegenCode(e.target.value)}
                          />
                          <button
                            type="button"
                            className="btn-secondary shrink-0 gap-1.5"
                            disabled={securityBusy}
                            onClick={() => void regenerateBackupCodes()}
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                            New backup codes
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          className="field-input"
                          placeholder="Code to disable 2FA"
                          value={disableCode}
                          onChange={(e) => setDisableCode(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn-secondary shrink-0 text-red-700 hover:border-red-200 hover:bg-red-50"
                          disabled={securityBusy}
                          onClick={() => void disable2fa()}
                        >
                          Disable 2FA
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {freshBackupCodes && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    <p className="mb-2 font-medium">
                      Save these backup login codes now
                    </p>
                    <p className="mb-3 text-xs text-amber-900/80">
                      Each code works once if you lose your authenticator. They
                      won’t be shown again.
                    </p>
                    <ul className="grid grid-cols-2 gap-2 font-mono text-xs">
                      {freshBackupCodes.map((code) => (
                        <li
                          key={code}
                          className="rounded border border-amber-200 bg-white px-2 py-1.5"
                        >
                          {code}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="mt-3 text-xs font-medium underline"
                      onClick={() => setFreshBackupCodes(null)}
                    >
                      I’ve saved them
                    </button>
                  </div>
                )}
              </div>

              {error && (
                <div className="mx-auto max-w-xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              {message && (
                <div className="mx-auto max-w-xl rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {message}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </WebmailShell>
  );
}
