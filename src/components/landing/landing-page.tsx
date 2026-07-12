"use client";

import { Mail, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { useTheme } from "@/components/theme-provider";

const testimonials = [
  {
    quote:
      "We replaced Roundcube and finally have a webmail our team is proud to open every morning.",
    name: "Elena Marquez",
    role: "Operations lead, coastal logistics firm",
  },
  {
    quote:
      "Signup, inbox, and calendar in one place — our clients stop asking for the old webmail link.",
    name: "James Okonkwo",
    role: "Agency founder",
  },
  {
    quote:
      "License activation was simple, install settings are all in admin, and we were live the same afternoon.",
    name: "Priya Nair",
    role: "IT manager, mid-size retailer",
  },
];

const previewMessages = [
  {
    from: "Maya Chen",
    subject: "Q3 invoice ready for review",
    preview: "Attached is the updated invoice for the coastal route…",
    time: "9:41",
    unread: true,
  },
  {
    from: "Ops Desk",
    subject: "Mailbox signup is open",
    preview: "New teammates can create @yourdomain addresses today.",
    time: "Yesterday",
    unread: false,
  },
  {
    from: "Support",
    subject: "Welcome to Webmail Pro",
    preview: "Activate your license, set IMAP hosts, and you are live.",
    time: "Mon",
    unread: false,
  },
];

export function LandingPage({ domain }: { domain: string }) {
  const [ready, setReady] = useState(false);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Link href="/" className="landing-brand">
            <span className="landing-brand-mark" aria-hidden>
              <Mail className="h-4 w-4" />
            </span>
            <span className="landing-brand-text">
              <span className="landing-brand-name">RamerLabs</span>
              <span className="landing-brand-sub">Webmail Pro</span>
            </span>
          </Link>
          <div className="landing-nav-actions">
            <button
              type="button"
              onClick={toggle}
              className="landing-theme-toggle"
              title={theme === "dark" ? "Light mode" : "Dark mode"}
              aria-label={
                theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
              }
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
            <a href="#signin" className="landing-link">
              Sign in
            </a>
            <a
              href="https://ramerlabs.com/product/ramerlabs-webmail-pro/"
              className="btn-primary landing-nav-cta"
              target="_blank"
              rel="noreferrer"
            >
              Get license
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className={`landing-hero ${ready ? "is-ready" : ""}`}>
          <div className="landing-hero-top">
            <div className="landing-hero-copy">
              <p className="landing-kicker">RamerLabs</p>
              <h1 className="landing-title">Your domain. Your webmail.</h1>
              <p className="landing-lede">
                Modern mail for @{domain} — inbox, contacts, and admin control
                without the Roundcube look.
              </p>
              <div className="landing-cta-row">
                <a
                  href="https://ramerlabs.com/product/ramerlabs-webmail-pro/"
                  className="btn-primary landing-cta-primary"
                  target="_blank"
                  rel="noreferrer"
                >
                  Get a lifetime license
                </a>
                <a href="#signin" className="btn-secondary landing-cta-secondary">
                  Sign in below
                </a>
              </div>
            </div>

            <div id="signin" className="landing-signin">
              <div className="landing-signin-panel">
                <h2 className="landing-signin-title">Sign in</h2>
                <p className="landing-signin-lede">
                  Manage your @{domain} mailbox or admin account.
                </p>
                <LoginForm domain={domain} />
              </div>
            </div>
          </div>

          <div
            className="landing-hero-visual"
            aria-label="Webmail product preview"
          >
            <div className="landing-preview">
              <aside className="landing-preview-rail">
                <div className="landing-preview-brand">
                  <span className="landing-preview-mark" />
                  <div>
                    <strong>RamerLabs</strong>
                    <em>Webmail Pro</em>
                  </div>
                </div>
                <nav>
                  <span className="is-active">Mail</span>
                  <span>Contacts</span>
                  <span>Calendar</span>
                  <span>Settings</span>
                </nav>
              </aside>
              <div className="landing-preview-list">
                <div className="landing-preview-list-head">Inbox</div>
                {previewMessages.map((msg) => (
                  <article
                    key={msg.subject}
                    className={msg.unread ? "is-unread" : undefined}
                  >
                    <header>
                      <strong>{msg.from}</strong>
                      <time>{msg.time}</time>
                    </header>
                    <p className="landing-preview-subject">{msg.subject}</p>
                    <p className="landing-preview-snippet">{msg.preview}</p>
                  </article>
                ))}
              </div>
              <div className="landing-preview-reader">
                <p className="landing-preview-reader-label">Reading</p>
                <h3>Q3 invoice ready for review</h3>
                <p className="landing-preview-reader-meta">
                  Maya Chen · you@{domain}
                </p>
                <p className="landing-preview-reader-body">
                  Attached is the updated invoice for the coastal route. Once
                  you approve, we will send it from your branded mailbox.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section landing-features">
          <h2 className="landing-section-title">Built for your domain</h2>
          <p className="landing-section-lede">
            Provision real cPanel mailboxes, manage them from one admin desk, and
            unlock the product with a RamerLabs license.
          </p>
          <ul className="landing-feature-list">
            <li>
              <strong>Mailbox signup</strong>
              <span>Captcha-protected accounts on @{domain}</span>
            </li>
            <li>
              <strong>Full webmail</strong>
              <span>Inbox, send, contacts, calendar, notes, and more</span>
            </li>
            <li>
              <strong>Admin install settings</strong>
              <span>Configure IMAP, SMTP, and cPanel without editing .env</span>
            </li>
          </ul>
        </section>

        <section className="landing-section landing-testimonials">
          <h2 className="landing-section-title">What teams say</h2>
          <p className="landing-section-lede">
            Operators who moved off generic Roundcube skins onto their own
            branded webmail.
          </p>
          <div className="landing-quote-list">
            {testimonials.map((t) => (
              <blockquote key={t.name} className="landing-quote">
                <p>“{t.quote}”</p>
                <footer>
                  <cite>{t.name}</cite>
                  <span>{t.role}</span>
                </footer>
              </blockquote>
            ))}
          </div>
        </section>

        <section className="landing-section landing-close">
          <h2 className="landing-section-title">Deploy on your domain</h2>
          <p className="landing-section-lede">
            One lifetime license. Activate in Admin, point mail hosts at your
            cPanel, and open signup for your users.
          </p>
          <div className="landing-cta-row landing-cta-center">
            <a
              href="https://ramerlabs.com/product/ramerlabs-webmail-pro/"
              className="btn-primary landing-cta-primary"
              target="_blank"
              rel="noreferrer"
            >
              Buy on ramerlabs.com
            </a>
            <Link href="/signup" className="btn-secondary landing-cta-secondary">
              Create a mailbox
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p>
          © {new Date().getFullYear()}{" "}
          <a href="https://ramerlabs.com" target="_blank" rel="noreferrer">
            RamerLabs
          </a>
          {" · "}
          <a href="mailto:support@ramerlabs.com">support@ramerlabs.com</a>
        </p>
      </footer>
    </div>
  );
}
