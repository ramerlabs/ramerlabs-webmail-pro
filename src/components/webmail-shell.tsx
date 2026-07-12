"use client";

import {
  CalendarDays,
  CandlestickChart,
  CheckSquare,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  Moon,
  Settings,
  StickyNote,
  Sun,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

type NavKey =
  | "mail"
  | "contacts"
  | "calendar"
  | "todos"
  | "notes"
  | "trades"
  | "expenses"
  | "settings"
  | "admin";

interface WebmailShellProps {
  email: string;
  active: NavKey;
  children: ReactNode;
  sidebarExtra?: ReactNode;
  sidebarCta?: ReactNode;
  /** Optional hint; shell also checks /api/auth/me */
  isAdmin?: boolean;
}

export function WebmailShell({
  email,
  active,
  children,
  sidebarExtra,
  sidebarCta,
  isAdmin: isAdminProp = false,
}: WebmailShellProps) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [isAdmin, setIsAdmin] = useState(isAdminProp);
  const [hasMailbox, setHasMailbox] = useState(true);
  const [isAppAdmin, setIsAppAdmin] = useState(false);
  const [mailboxPassword, setMailboxPassword] = useState("");
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [licenseActive, setLicenseActive] = useState<boolean | null>(null);
  const [licenseMessage, setLicenseMessage] = useState<string | null>(null);
  const [companyUrl, setCompanyUrl] = useState("https://ramerlabs.com");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        if (res.ok) {
          setIsAdmin(Boolean(data.isAdmin) || isAdminProp);
          setIsAppAdmin(Boolean(data.isAppAdmin));
          setHasMailbox(data.hasMailbox !== false);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [isAdminProp]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/config/license", { cache: "no-store" });
        const data = await res.json();
        setLicenseActive(Boolean(data.active));
        setLicenseMessage(
          data.message ||
            "RamerLabs Webmail Pro is not active. Please get a license key at ramerlabs.com to unlock this feature.",
        );
        if (data.companyUrl) setCompanyUrl(data.companyUrl);
      } catch {
        setLicenseActive(false);
        setLicenseMessage(
          "RamerLabs Webmail Pro is not active. Please get a license key at ramerlabs.com to unlock this feature.",
        );
      }
    })();
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function handleConnectMailbox(e: FormEvent) {
    e.preventDefault();
    setConnectBusy(true);
    setConnectError(null);
    try {
      const res = await fetch("/api/auth/connect-mailbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: mailboxPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConnectError(data.error || "Could not connect mailbox");
        return;
      }
      setHasMailbox(true);
      setMailboxPassword("");
      router.push("/mail");
      router.refresh();
    } catch {
      setConnectError("Network error connecting mailbox");
    } finally {
      setConnectBusy(false);
    }
  }

  const featuresLocked = licenseActive !== true && active !== "admin";

  const allLinks: {
    key: NavKey;
    href: string;
    label: string;
    icon: typeof Mail;
  }[] = [
    { key: "mail", href: "/mail", label: "Mail", icon: Mail },
    { key: "contacts", href: "/contacts", label: "Contacts", icon: Users },
    {
      key: "calendar",
      href: "/calendar",
      label: "Calendar",
      icon: CalendarDays,
    },
    { key: "todos", href: "/todos", label: "To-do", icon: CheckSquare },
    { key: "notes", href: "/notes", label: "Notes", icon: StickyNote },
    {
      key: "trades",
      href: "/trades",
      label: "Trading Journal",
      icon: CandlestickChart,
    },
    { key: "expenses", href: "/expenses", label: "Expense Tracker", icon: Wallet },
    { key: "settings", href: "/settings", label: "Settings", icon: Settings },
  ];

  // Installer-only (no IMAP) — Admin console only until mailbox is connected
  const links = hasMailbox ? [...allLinks] : [];

  if (isAdmin) {
    links.push({
      key: "admin",
      href: "/admin",
      label: "Admin",
      icon: LayoutDashboard,
    });
  }

  return (
    <div className={cn("mail-shell", active !== "mail" && "mail-shell-wide")}>
      <aside className="mail-sidebar flex">
        <div className="flex items-center justify-between gap-2 px-1 pb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-sm">
              <Mail className="h-4.5 w-4.5" strokeWidth={2.25} />
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-[var(--foreground)]">
                RamerLabs
              </p>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                Webmail Pro
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggle}
            className="icon-btn"
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        </div>

        {!featuresLocked && sidebarCta}

        <nav className="mb-3 flex flex-col gap-0.5">
          {links.map(({ key, href, label, icon: Icon }) => {
            const isActive = active === key;
            const locked = licenseActive !== true && key !== "admin";
            return (
              <Link
                key={key}
                href={href}
                aria-disabled={locked}
                onClick={(e) => {
                  if (locked) e.preventDefault();
                }}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  locked && "pointer-events-none opacity-40",
                  isActive
                    ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                    : "text-[var(--muted-strong)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                {label}
              </Link>
            );
          })}
        </nav>

        {!hasMailbox && isAppAdmin && (
          <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3">
            <p className="text-xs font-medium text-[var(--foreground)]">
              Unlock Mail for this admin account
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
              Enter your installer password (or cPanel password for{" "}
              <span className="font-medium text-[var(--foreground)]">
                {email}
              </span>
              ). We will create/sync the mailbox so you get the same inbox and
              compose UI as other accounts.
            </p>
            <form onSubmit={handleConnectMailbox} className="mt-2 space-y-2">
              <input
                type="password"
                className="field-input text-sm"
                placeholder="Mailbox password"
                value={mailboxPassword}
                onChange={(e) => setMailboxPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              {connectError && (
                <p className="text-[11px] text-red-600">{connectError}</p>
              )}
              <button
                type="submit"
                className="btn-primary w-full text-xs"
                disabled={connectBusy || !mailboxPassword}
              >
                {connectBusy ? "Connecting…" : "Connect & open Mail"}
              </button>
            </form>
          </div>
        )}

        {!featuresLocked && sidebarExtra}

        <div className="mt-auto shrink-0 border-t border-[var(--border)] pt-4">
          <div className="mb-3 flex items-center gap-3 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--muted-strong)]">
              <span className="text-xs font-semibold uppercase">
                {(email.split("@")[0] || "?").slice(0, 2)}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {email.split("@")[0]}
              </p>
              <p className="truncate text-xs text-[var(--muted)]">{email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      {featuresLocked ? (
        <section className="mail-reader mail-reader-full flex flex-1 items-center justify-center p-6">
          <div className="mx-auto max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
              <KeyRound className="h-5 w-5" />
            </div>
            <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
              License required
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted-strong)]">
              {licenseMessage}
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              {isAdmin && (
                <Link href="/admin" className="btn-primary">
                  Open admin · activate license
                </Link>
              )}
              <a
                href={companyUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
              >
                Get license at ramerlabs.com
              </a>
            </div>
          </div>
        </section>
      ) : (
        children
      )}
    </div>
  );
}
