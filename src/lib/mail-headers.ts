import { randomBytes } from "crypto";

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/** Human-friendly From display name for outbound mail. */
export function getMailFromName(email: string): string {
  const configured = optional("MAIL_FROM_NAME").trim();
  if (configured) return configured;

  const local = email.split("@")[0] || "User";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** RFC 5322 From header value: "Name" <user@domain.com> */
export function formatFromHeader(email: string, displayName?: string): string {
  const name = (displayName || getMailFromName(email)).replace(/"/g, "");
  return `"${name}" <${email}>`;
}

/** Message-ID on the sending domain (helps alignment with DKIM/DMARC). */
export function createMessageId(email?: string): string {
  const domain =
    email?.split("@")[1] || optional("MAIL_DOMAIN") || "localhost";
  const id = randomBytes(12).toString("hex");
  return `<${id}.${Date.now()}@${domain}>`;
}

export function getMailerIdentity(): string {
  return optional("MAIL_USER_AGENT", "RamerLabs-Webmail/1.0");
}
