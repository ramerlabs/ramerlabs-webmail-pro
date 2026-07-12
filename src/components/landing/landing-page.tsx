"use client";

import { Mail } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const testimonials = [
  {
    quote:
      "We replaced Roundcube and finally have a webmail our team is proud to open every morning.",
    name: "Elena Marquez",
    role: "Operations lead, coastal logistics firm",
  },
  {
    quote:
      "Signup, inbox, and calendar in one place — our clients stop asking for “the old webmail link.”",
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

export function LandingPage() {
  const [ready, setReady] = useState(false);

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
            <Link href="/login" className="landing-link">
              Sign in
            </Link>
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
          <div className="landing-hero-copy">
            <p className="landing-kicker">RamerLabs</p>
            <h1 className="landing-title">Your domain. Your webmail.</h1>
            <p className="landing-lede">
              Modern mail for @yourdomain — inbox, contacts, and admin control
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
              <Link href="/login" className="btn-secondary landing-cta-secondary">
                Sign in to your install
              </Link>
            </div>
          </div>

          <div className="landing-hero-visual" aria-hidden={false}>
            <Image
              src="/images/webmail-hero.png"
              alt="RamerLabs Webmail Pro login screen"
              width={1600}
              height={1000}
              priority
              className="landing-hero-image"
            />
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
              <span>Captcha-protected accounts on @yourdomain</span>
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
