import { createHash, randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function requiredSoft(name: string, label?: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${label || name}. Open Admin → Install settings and save your configuration.`,
    );
  }
  return value;
}

/** Stable session secret: env → .data file → derived fallback (Vercel). */
export function getSessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 32) return fromEnv;

  const filePath = path.join(process.cwd(), ".data", "session-secret");
  try {
    if (existsSync(filePath)) {
      const saved = readFileSync(filePath, "utf8").trim();
      if (saved.length >= 32) {
        process.env.SESSION_SECRET = saved;
        return saved;
      }
    }
  } catch {
    /* ignore */
  }

  if (!process.env.VERCEL) {
    const generated = randomBytes(32).toString("hex");
    try {
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, generated, "utf8");
    } catch {
      /* ignore */
    }
    process.env.SESSION_SECRET = generated;
    return generated;
  }

  // Serverless without writable disk: derive a stable secret from deployment identity.
  const derived = createHash("sha256")
    .update(
      [
        process.env.VERCEL_URL || "",
        process.env.VERCEL_PROJECT_ID || "",
        process.env.MAIL_DOMAIN || "webmail-pro",
        "ramerlabs-webmail-pro-session",
      ].join("|"),
    )
    .digest("hex");
  process.env.SESSION_SECRET = derived;
  return derived;
}

export function getMailDomain(): string {
  return optional("MAIL_DOMAIN") || "yourdomain.com";
}

export function getCpanelConfig() {
  return {
    host: requiredSoft("CPANEL_HOST", "cPanel host"),
    port: Number(optional("CPANEL_PORT", "2083")),
    username: requiredSoft("CPANEL_USERNAME", "cPanel username"),
    apiToken: requiredSoft("CPANEL_API_TOKEN", "cPanel API token"),
    quotaMb: Number(optional("CPANEL_MAILBOX_QUOTA_MB", "500")),
    domain: getMailDomain(),
  };
}

export function getImapConfig() {
  return {
    host: requiredSoft("IMAP_HOST", "IMAP host"),
    port: Number(optional("IMAP_PORT", "993")),
    secure: optional("IMAP_SECURE", "true") === "true",
  };
}

export function getSmtpConfig() {
  return {
    host: requiredSoft("SMTP_HOST", "SMTP host"),
    port: Number(optional("SMTP_PORT", "465")),
    secure: optional("SMTP_SECURE", "true") === "true",
  };
}

export function getMailFromNameEnv(): string {
  return optional("MAIL_FROM_NAME");
}

export type CaptchaProvider = "turnstile" | "recaptcha" | "none";

export function getCaptchaConfig() {
  const provider = (optional("CAPTCHA_PROVIDER", "turnstile") ||
    "turnstile") as CaptchaProvider;

  return {
    provider,
    turnstileSiteKey: optional("NEXT_PUBLIC_TURNSTILE_SITE_KEY"),
    turnstileSecret: optional("TURNSTILE_SECRET_KEY"),
    recaptchaSiteKey: optional("NEXT_PUBLIC_RECAPTCHA_SITE_KEY"),
    recaptchaSecret: optional("RECAPTCHA_SECRET_KEY"),
  };
}
