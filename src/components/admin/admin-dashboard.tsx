"use client";

import {
  Ban,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  Mail,
  Megaphone,
  RefreshCw,
  Settings2,
  Shield,
  UserPlus,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WebmailShell } from "@/components/webmail-shell";
import { cn } from "@/lib/utils";

interface AdminStats {
  domain: string;
  storage: {
    available: boolean;
    percent: number;
    usedLabel: string;
    limitLabel: string;
    error?: string;
  };
  mailboxes: {
    email: string;
    usedMb: number | null;
    quotaMb: number | null;
    percent: number | null;
  }[];
  mailboxCount: number;
  mailboxesError?: string;
}

type Tab = "overview" | "license" | "install" | "account";

const emptyConfig: Record<string, string> = {
  mailDomain: "",
  nextPublicAppUrl: "",
  adminEmails: "",
  sessionSecret: "",
  cpanelHost: "",
  cpanelPort: "2083",
  cpanelUsername: "",
  cpanelApiToken: "",
  cpanelMailboxQuotaMb: "500",
  imapHost: "",
  imapPort: "993",
  imapSecure: "true",
  smtpHost: "",
  smtpPort: "465",
  smtpSecure: "true",
  mailFromName: "",
  systemMailEmail: "",
  systemMailPassword: "",
  davServerUrl: "",
  captchaProvider: "turnstile",
  turnstileSiteKey: "",
  turnstileSecretKey: "",
  upstashRedisRestUrl: "",
  upstashRedisRestToken: "",
  lacidawebPlacementId: "",
};

export function AdminDashboard({
  email,
  isAppAdmin = false,
}: {
  email: string;
  isAppAdmin?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adsEnabled, setAdsEnabled] = useState(true);
  const [adsPlacementId, setAdsPlacementId] = useState("");
  const [adsCustomHtml, setAdsCustomHtml] = useState("");
  const [signupEnabled, setSignupEnabled] = useState(true);
  const [landingEnabled, setLandingEnabled] = useState(true);
  const [blockedEmails, setBlockedEmails] = useState<string[]>([]);
  const [blockInput, setBlockInput] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [licenseKey, setLicenseKey] = useState("");
  const [licenseInfo, setLicenseInfo] = useState<{
    activated: boolean;
    hasKey: boolean;
    licenseKeyMasked: string;
    lastMessage: string | null;
    supportEmail: string;
    companyUrl: string;
  } | null>(null);
  const [licenseBusy, setLicenseBusy] = useState(false);

  const [config, setConfig] = useState(emptyConfig);
  const [configSaving, setConfigSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [hasMailbox, setHasMailbox] = useState(true);
  const [mailboxPassword, setMailboxPassword] = useState("");
  const [mailboxBusy, setMailboxBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, settingsRes, licenseRes, configRes] = await Promise.all([
        fetch("/api/admin/stats", { cache: "no-store" }),
        fetch("/api/admin/settings", { cache: "no-store" }),
        fetch("/api/admin/license", { cache: "no-store" }),
        fetch("/api/admin/config", { cache: "no-store" }),
      ]);

      const statsData = await statsRes.json();
      if (!statsRes.ok) {
        if (tab === "overview") {
          setError(statsData.error || "Failed to load admin stats");
        }
        setStats(null);
      } else {
        setStats(statsData);
      }

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setAdsEnabled(settingsData.settings?.adsEnabled !== false);
        setAdsPlacementId(settingsData.settings?.adsPlacementId || "");
        setAdsCustomHtml(settingsData.settings?.adsCustomHtml || "");
        setSignupEnabled(settingsData.settings?.signupEnabled !== false);
        setLandingEnabled(settingsData.settings?.landingEnabled !== false);
        setBlockedEmails(
          Array.isArray(settingsData.settings?.blockedEmails)
            ? settingsData.settings.blockedEmails
            : [],
        );
      }

      if (licenseRes.ok) {
        const lic = await licenseRes.json();
        setLicenseInfo(lic);
      }

      if (configRes.ok) {
        const cfgData = await configRes.json();
        setConfig({ ...emptyConfig, ...(cfgData.config || {}) });
      }
    } catch {
      setError("Network error loading admin dashboard");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        if (res.ok) setHasMailbox(data.hasMailbox !== false);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function connectMailbox(e: React.FormEvent) {
    e.preventDefault();
    setMailboxBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/connect-mailbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: mailboxPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not connect mailbox");
        return;
      }
      setHasMailbox(true);
      setMailboxPassword("");
      setMessage(data.message || "Mailbox connected.");
      router.push("/mail");
      router.refresh();
    } catch {
      setError("Network error connecting mailbox");
    } finally {
      setMailboxBusy(false);
    }
  }

  async function saveSettings(
    patch: Record<string, unknown>,
    successMessage?: string,
  ) {
    setSettingsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update settings");
        return;
      }
      setAdsEnabled(data.settings?.adsEnabled !== false);
      setAdsPlacementId(data.settings?.adsPlacementId || "");
      setAdsCustomHtml(data.settings?.adsCustomHtml || "");
      setSignupEnabled(data.settings?.signupEnabled !== false);
      setLandingEnabled(data.settings?.landingEnabled !== false);
      setBlockedEmails(
        Array.isArray(data.settings?.blockedEmails)
          ? data.settings.blockedEmails
          : [],
      );
      if (successMessage) setMessage(successMessage);
    } catch {
      setError("Network error saving settings");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleBlockSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!blockInput.trim()) return;
    await saveSettings(
      { blockEmail: blockInput.trim() },
      `Blocked ${blockInput.trim()}.`,
    );
    setBlockInput("");
  }

  async function activateLicense() {
    setLicenseBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseKey: licenseKey.trim(),
          action: "activate",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || data.message || "Activation failed");
      } else {
        setMessage(data.message || "License activated.");
        setLicenseKey("");
      }
      const licRes = await fetch("/api/admin/license", { cache: "no-store" });
      if (licRes.ok) setLicenseInfo(await licRes.json());
    } catch {
      setError("Network error contacting license service");
    } finally {
      setLicenseBusy(false);
    }
  }

  async function checkLicense() {
    if (!licenseKey.trim() && !licenseInfo?.hasKey) {
      setError("Enter a license key to check.");
      return;
    }
    setLicenseBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseKey: licenseKey.trim() || "stored",
          action: "validate",
          useStored: !licenseKey.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || data.message || "Validation failed");
      } else {
        setMessage(data.message || "License is valid.");
      }
      const licRes = await fetch("/api/admin/license", { cache: "no-store" });
      if (licRes.ok) setLicenseInfo(await licRes.json());
    } catch {
      setError("Network error contacting license service");
    } finally {
      setLicenseBusy(false);
    }
  }

  async function deactivateLicense() {
    setLicenseBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseKey: licenseKey.trim() || "stored",
          action: "deactivate",
          useStored: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || data.message || "Deactivate failed");
      } else {
        setMessage(data.message || "License deactivated.");
        setLicenseKey("");
      }
      const licRes = await fetch("/api/admin/license", { cache: "no-store" });
      if (licRes.ok) setLicenseInfo(await licRes.json());
    } catch {
      setError("Network error contacting license service");
    } finally {
      setLicenseBusy(false);
    }
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    setConfigSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save configuration");
        return;
      }
      setConfig({ ...emptyConfig, ...(data.config || {}) });
      setMessage(
        "Install settings saved. They apply immediately on this server.",
      );
    } catch {
      setError("Network error saving configuration");
    } finally {
      setConfigSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to change password");
        return;
      }
      setMessage("Admin password updated.");
      setCurrentPassword("");
      setNewPassword("");
    } catch {
      setError("Network error changing password");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function logoutAdmin() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    window.location.href = "/admin/login";
  }

  function field(
    key: string,
    label: string,
    opts?: { type?: string; hint?: string },
  ) {
    return (
      <div key={key}>
        <label className="mb-1.5 block text-sm font-medium" htmlFor={key}>
          {label}
        </label>
        <input
          id={key}
          className="field-input"
          type={opts?.type || "text"}
          value={config[key] || ""}
          onChange={(e) =>
            setConfig((c) => ({ ...c, [key]: e.target.value }))
          }
        />
        {opts?.hint && (
          <p className="mt-1 text-xs text-[var(--muted)]">{opts.hint}</p>
        )}
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "license", label: "License", icon: KeyRound },
    { id: "install", label: "Install settings", icon: Settings2 },
    { id: "account", label: "Admin account", icon: Shield },
  ];

  return (
    <WebmailShell email={email} active="admin" isAdmin>
      <section className="mail-reader mail-reader-full">
        <div className="border-b border-[var(--border)] px-6 py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <LayoutDashboard className="h-5 w-5 text-[var(--accent)]" />
              <div>
                <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
                  Admin dashboard
                </h1>
                <p className="text-sm text-[var(--muted)]">
                  License, install settings, storage, and mailboxes
                  {stats?.domain ? ` · ${stats.domain}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAppAdmin && (
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => void logoutAdmin()}
                >
                  Log out
                </button>
              )}
              <button
                type="button"
                className="btn-secondary gap-1.5 text-sm"
                onClick={() => void load()}
                disabled={loading}
              >
                <RefreshCw
                  className={cn("h-4 w-4", loading && "animate-spin")}
                />
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                  tab === id
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-muted)] text-[var(--muted-strong)] hover:text-[var(--foreground)]",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mail-body-scroll flex-1 space-y-6 p-6">
          {error && (
            <div className="mx-auto max-w-3xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {message && (
            <div className="mx-auto max-w-3xl rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {message}
            </div>
          )}

          {tab === "license" && (
            <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <div
                className="px-5 py-4 text-white"
                style={{
                  background:
                    "linear-gradient(135deg, #7c3aed 0%, #4f46e5 55%, #312e81 100%)",
                }}
              >
                <p className="text-sm font-medium opacity-90">RamerLabs</p>
                <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
                  License activation
                </h2>
                <p className="mt-1 text-sm text-white/80">
                  Enter the license key from your purchase. Need help?{" "}
                  <a
                    className="underline"
                    href={`mailto:${licenseInfo?.supportEmail || "support@ramerlabs.com"}`}
                  >
                    {licenseInfo?.supportEmail || "support@ramerlabs.com"}
                  </a>
                </p>
              </div>
              <div className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[var(--muted)]">Status</span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium",
                      licenseInfo?.activated
                        ? "bg-emerald-500/15 text-emerald-700"
                        : "bg-amber-500/15 text-amber-800",
                    )}
                  >
                    {licenseInfo?.activated ? "Active" : "Inactive"}
                  </span>
                </div>
                {licenseInfo?.hasKey && (
                  <p className="text-sm text-[var(--muted-strong)]">
                    Current key: {licenseInfo.licenseKeyMasked}
                  </p>
                )}
                {licenseInfo?.lastMessage && (
                  <p className="text-xs text-[var(--muted)]">
                    {licenseInfo.lastMessage}
                  </p>
                )}
                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    htmlFor="licenseKey"
                  >
                    License key
                  </label>
                  <input
                    id="licenseKey"
                    className="field-input font-mono text-sm"
                    placeholder="RLM-XXXX-XXXX-XXXX"
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={licenseBusy || !licenseKey.trim()}
                    onClick={() => void activateLicense()}
                  >
                    Activate license
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={licenseBusy}
                    onClick={() => void checkLicense()}
                  >
                    Check license
                  </button>
                  {licenseInfo?.hasKey && (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={licenseBusy}
                      onClick={() => void deactivateLicense()}
                    >
                      Deactivate
                    </button>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)]">
                  Buy or manage licenses at{" "}
                  <a
                    className="underline"
                    href={licenseInfo?.companyUrl || "https://ramerlabs.com"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    ramerlabs.com
                  </a>
                  .
                </p>
              </div>
            </div>
          )}

          {tab === "install" && (
            <form
              onSubmit={saveConfig}
              className="mx-auto max-w-3xl space-y-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div>
                <h2 className="text-sm font-medium">Install settings</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Configure the app here instead of editing <code>.env</code>.
                  Secrets show as masked; leave unchanged to keep the current
                  value. On Vercel, set Upstash Redis in the host env first so
                  settings persist across deploys.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {field("mailDomain", "Mail domain", {
                  hint: "Shown as @domain on signup",
                })}
                {field("nextPublicAppUrl", "App URL")}
                {field("adminEmails", "Admin mailbox emails", {
                  hint: "Comma-separated mailbox admins",
                })}
                {field("sessionSecret", "Session secret", {
                  type: "password",
                  hint: "Min 32 chars; auto-generated if empty locally",
                })}
              </div>

              <h3 className="text-sm font-medium pt-2">cPanel</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {field("cpanelHost", "cPanel host")}
                {field("cpanelPort", "cPanel port")}
                {field("cpanelUsername", "cPanel username")}
                {field("cpanelApiToken", "cPanel API token", {
                  type: "password",
                })}
                {field("cpanelMailboxQuotaMb", "Mailbox quota (MB)")}
                {field("davServerUrl", "DAV server URL")}
              </div>

              <h3 className="text-sm font-medium pt-2">IMAP / SMTP</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {field("imapHost", "IMAP host")}
                {field("imapPort", "IMAP port")}
                {field("imapSecure", "IMAP secure (true/false)")}
                {field("smtpHost", "SMTP host")}
                {field("smtpPort", "SMTP port")}
                {field("smtpSecure", "SMTP secure (true/false)")}
                {field("mailFromName", "Default From name")}
                {field("systemMailEmail", "System mail email")}
                {field("systemMailPassword", "System mail password", {
                  type: "password",
                })}
              </div>

              <h3 className="text-sm font-medium pt-2">Captcha & Redis</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {field("captchaProvider", "Captcha provider", {
                  hint: "turnstile | recaptcha | none",
                })}
                {field("turnstileSiteKey", "Turnstile site key")}
                {field("turnstileSecretKey", "Turnstile secret", {
                  type: "password",
                })}
                {field("upstashRedisRestUrl", "Upstash Redis URL")}
                {field("upstashRedisRestToken", "Upstash Redis token", {
                  type: "password",
                })}
                {field("lacidawebPlacementId", "Lacidaweb placement ID")}
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={configSaving}
              >
                {configSaving ? "Saving…" : "Save install settings"}
              </button>
            </form>
          )}

          {tab === "account" && (
            <div className="mx-auto max-w-3xl space-y-4">
              {isAppAdmin && !hasMailbox && (
                <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-5">
                  <div className="flex items-start gap-3">
                    <Mail className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-medium">
                        Connect mailbox to send email
                      </h2>
                      <p className="mt-1 text-xs text-[var(--muted-strong)]">
                        The installer account opens Admin only. Create{" "}
                        <strong>{email}</strong> in cPanel (if needed), then enter
                        that mailbox password here. Mail, compose, and the full
                        sidebar unlock for this session.
                      </p>
                      <form
                        onSubmit={connectMailbox}
                        className="mt-4 flex max-w-md flex-col gap-2 sm:flex-row"
                      >
                        <input
                          className="field-input flex-1"
                          type="password"
                          placeholder="cPanel mailbox password"
                          value={mailboxPassword}
                          onChange={(e) => setMailboxPassword(e.target.value)}
                          required
                        />
                        <button
                          type="submit"
                          className="btn-primary sm:w-fit"
                          disabled={mailboxBusy || !mailboxPassword}
                        >
                          {mailboxBusy ? "Connecting…" : "Connect mailbox"}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              )}
              {isAppAdmin && hasMailbox && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p className="text-sm font-medium">Mailbox connected</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Open <a className="text-[var(--accent)] underline" href="/mail">Mail</a>{" "}
                    and use <strong>New Message</strong> to send email as{" "}
                    {email}.
                  </p>
                </div>
              )}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <h2 className="text-sm font-medium">App admin account</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Signed in as <strong>{email}</strong>
                  {isAppAdmin
                    ? " (installer account)"
                    : " (mailbox admin)"}
                  . Change the installer password after first login (see the
                  product README for default credentials).
                </p>
                {isAppAdmin && (
                  <form
                    onSubmit={changePassword}
                    className="mt-4 grid max-w-md gap-3"
                  >
                    <input
                      className="field-input"
                      type="password"
                      placeholder="Current password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                    <input
                      className="field-input"
                      type="password"
                      placeholder="New password (min 8)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                    <button
                      type="submit"
                      className="btn-primary w-fit"
                      disabled={passwordBusy}
                    >
                      {passwordBusy ? "Updating…" : "Change password"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {tab === "overview" && (
            <>
              <div className="mx-auto max-w-3xl space-y-4">
                {isAppAdmin && !hasMailbox && (
                  <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-5">
                    <div className="flex items-start gap-3">
                      <Mail className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          Unlock Mail like a normal account
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-[var(--muted-strong)]">
                          Admin needs a real cPanel mailbox for{" "}
                          <strong>{email}</strong>. Enter your password below —
                          we will create or sync it, then open the same Mail /
                          compose UI other accounts use.
                        </p>
                        <form
                          onSubmit={connectMailbox}
                          className="mt-4 flex max-w-md flex-col gap-2 sm:flex-row"
                        >
                          <input
                            className="field-input flex-1"
                            type="password"
                            placeholder="cPanel mailbox password"
                            value={mailboxPassword}
                            onChange={(e) => setMailboxPassword(e.target.value)}
                            required
                          />
                          <button
                            type="submit"
                            className="btn-primary sm:w-fit"
                            disabled={mailboxBusy || !mailboxPassword}
                          >
                            {mailboxBusy ? "Connecting…" : "Connect & open Mail"}
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                )}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <Megaphone className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
                      <div>
                        <p className="text-sm font-medium">Ads</p>
                        <p className="mt-1 max-w-md text-xs text-[var(--muted)]">
                          Show or hide the sponsored slot in the message reader.
                          Set a Lacidaweb placement ID, or paste custom HTML /
                          embed code to replace it.
                        </p>
                      </div>
                    </div>
                    <label className="flex items-center gap-3 text-sm">
                      <span className="text-[var(--muted-strong)]">
                        {adsEnabled ? "Enabled" : "Disabled"}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={adsEnabled}
                        disabled={settingsSaving}
                        onClick={() =>
                          void saveSettings({ adsEnabled: !adsEnabled })
                        }
                        className={cn(
                          "relative h-7 w-12 rounded-full transition-colors",
                          adsEnabled
                            ? "bg-[var(--accent)]"
                            : "bg-[var(--border)]",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
                            adsEnabled ? "left-5" : "left-0.5",
                          )}
                        />
                      </button>
                    </label>
                  </div>

                  <form
                    className="mt-5 space-y-3 border-t border-[var(--border)] pt-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveSettings(
                        {
                          adsPlacementId: adsPlacementId.trim(),
                          adsCustomHtml: adsCustomHtml,
                        },
                        "Ads code saved.",
                      );
                    }}
                  >
                    <div>
                      <label
                        className="mb-1.5 block text-sm font-medium"
                        htmlFor="adsPlacementId"
                      >
                        Lacidaweb placement ID
                      </label>
                      <input
                        id="adsPlacementId"
                        className="field-input font-mono text-sm"
                        value={adsPlacementId}
                        onChange={(e) => setAdsPlacementId(e.target.value)}
                        placeholder="cmreflbz9001gjw04x1ylhtfo"
                        disabled={settingsSaving}
                      />
                    </div>
                    <div>
                      <label
                        className="mb-1.5 block text-sm font-medium"
                        htmlFor="adsCustomHtml"
                      >
                        Custom ads HTML / embed code
                      </label>
                      <textarea
                        id="adsCustomHtml"
                        className="field-input min-h-[120px] font-mono text-xs"
                        value={adsCustomHtml}
                        onChange={(e) => setAdsCustomHtml(e.target.value)}
                        placeholder={'<!-- optional: paste ad script or HTML here -->'}
                        disabled={settingsSaving}
                      />
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        If this is filled, it replaces Lacidaweb. Leave empty to
                        use the placement ID above.
                      </p>
                    </div>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={settingsSaving}
                    >
                      {settingsSaving ? "Saving…" : "Save ads code"}
                    </button>
                  </form>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <UserPlus className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
                      <div>
                        <p className="text-sm font-medium">
                          New mailbox signup
                        </p>
                        <p className="mt-1 max-w-md text-xs text-[var(--muted)]">
                          When disabled, visitors see: Build your custom webmail
                          @yourdomain.com — contact ramerlabs.com
                        </p>
                      </div>
                    </div>
                    <label className="flex items-center gap-3 text-sm">
                      <span className="text-[var(--muted-strong)]">
                        {signupEnabled ? "Open" : "Closed"}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={signupEnabled}
                        disabled={settingsSaving}
                        onClick={() =>
                          void saveSettings({ signupEnabled: !signupEnabled })
                        }
                        className={cn(
                          "relative h-7 w-12 rounded-full transition-colors",
                          signupEnabled
                            ? "bg-[var(--accent)]"
                            : "bg-[var(--border)]",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
                            signupEnabled ? "left-5" : "left-0.5",
                          )}
                        />
                      </button>
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <LayoutDashboard className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
                      <div>
                        <p className="text-sm font-medium">Landing page</p>
                        <p className="mt-1 max-w-md text-xs text-[var(--muted)]">
                          When enabled, guests see the marketing page at{" "}
                          <code className="text-[11px]">/</code>. When disabled,
                          they go straight to login.
                        </p>
                      </div>
                    </div>
                    <label className="flex items-center gap-3 text-sm">
                      <span className="text-[var(--muted-strong)]">
                        {landingEnabled ? "Enabled" : "Disabled"}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={landingEnabled}
                        disabled={settingsSaving}
                        onClick={() =>
                          void saveSettings(
                            { landingEnabled: !landingEnabled },
                            landingEnabled
                              ? "Landing page disabled. Guests go to login."
                              : "Landing page enabled.",
                          )
                        }
                        className={cn(
                          "relative h-7 w-12 rounded-full transition-colors",
                          landingEnabled
                            ? "bg-[var(--accent)]"
                            : "bg-[var(--border)]",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
                            landingEnabled ? "left-5" : "left-0.5",
                          )}
                        />
                      </button>
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <div className="mb-4 flex items-start gap-3">
                    <Ban className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
                    <div>
                      <p className="text-sm font-medium">Blocked emails</p>
                      <p className="mt-1 max-w-md text-xs text-[var(--muted)]">
                        Blocked addresses cannot sign in or create a mailbox.
                      </p>
                    </div>
                  </div>

                  <form
                    onSubmit={handleBlockSubmit}
                    className="mb-4 flex flex-col gap-2 sm:flex-row"
                  >
                    <input
                      className="field-input flex-1"
                      placeholder={`spam@${stats?.domain || "yourdomain.com"} or spam`}
                      value={blockInput}
                      onChange={(e) => setBlockInput(e.target.value)}
                      disabled={settingsSaving}
                    />
                    <button
                      type="submit"
                      className="btn-primary gap-2 sm:w-fit"
                      disabled={settingsSaving || !blockInput.trim()}
                    >
                      <Ban className="h-4 w-4" />
                      Block
                    </button>
                  </form>

                  {blockedEmails.length === 0 ? (
                    <p className="text-sm text-[var(--muted)]">
                      No emails are blocked.
                    </p>
                  ) : (
                    <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                      {blockedEmails.map((blocked) => (
                        <li
                          key={blocked}
                          className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                        >
                          <span className="font-medium">{blocked}</span>
                          <button
                            type="button"
                            className="btn-secondary text-xs"
                            disabled={settingsSaving}
                            onClick={() =>
                              void saveSettings(
                                { unblockEmail: blocked },
                                `Unblocked ${blocked}.`,
                              )
                            }
                          >
                            Unblock
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {loading && !stats ? (
                <p className="text-sm text-[var(--muted)]">Loading…</p>
              ) : (
                <>
                  <div className="mx-auto max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-[var(--accent)]" />
                      <p className="text-sm font-medium">Account storage</p>
                    </div>
                    {stats?.storage.available ? (
                      <>
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span className="text-[var(--muted)]">Storage</span>
                          <span className="font-semibold">
                            {stats.storage.percent}%
                          </span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                          <div
                            className="h-full rounded-full bg-[var(--accent)]"
                            style={{
                              width: `${Math.min(100, stats.storage.percent)}%`,
                            }}
                          />
                        </div>
                        <p className="mt-2 text-sm text-[var(--muted-strong)]">
                          {stats.storage.usedLabel} of{" "}
                          {stats.storage.limitLabel}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-[var(--muted)]">
                        {stats?.storage.error ||
                          "Configure cPanel in Install settings to load storage."}
                      </p>
                    )}
                  </div>

                  <div className="mx-auto max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-[var(--accent)]" />
                        <p className="text-sm font-medium">Mailboxes</p>
                      </div>
                      <span className="text-xs text-[var(--muted)]">
                        {stats?.mailboxCount ?? 0} accounts
                      </span>
                    </div>
                    {stats?.mailboxesError && (
                      <p className="mb-3 text-sm text-red-600">
                        {stats.mailboxesError}
                      </p>
                    )}
                    {!stats?.mailboxes?.length ? (
                      <p className="text-sm text-[var(--muted)]">
                        No mailboxes found.
                      </p>
                    ) : (
                      <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                        {stats.mailboxes.map((box) => {
                          const isBlocked = blockedEmails.includes(
                            box.email.toLowerCase(),
                          );
                          return (
                            <li
                              key={box.email}
                              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                            >
                              <div className="min-w-0">
                                <p className="font-medium">
                                  {box.email}
                                  {isBlocked && (
                                    <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                                      Blocked
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-[var(--muted)]">
                                  {box.usedMb != null
                                    ? `${box.usedMb.toFixed(1)} MB`
                                    : "—"}
                                  {" / "}
                                  {box.quotaMb != null
                                    ? `${box.quotaMb} MB`
                                    : "unlimited"}
                                  {box.percent != null
                                    ? ` · ${box.percent}%`
                                    : ""}
                                </p>
                              </div>
                              <button
                                type="button"
                                className="btn-secondary text-xs"
                                disabled={settingsSaving}
                                onClick={() =>
                                  void saveSettings(
                                    isBlocked
                                      ? { unblockEmail: box.email }
                                      : { blockEmail: box.email },
                                    isBlocked
                                      ? `Unblocked ${box.email}.`
                                      : `Blocked ${box.email}.`,
                                  )
                                }
                              >
                                {isBlocked ? "Unblock" : "Block"}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </WebmailShell>
  );
}
