import nodemailer from "nodemailer";
import { getSmtpConfig } from "@/lib/env";
import { createMessageId, getMailerIdentity } from "@/lib/mail-headers";

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export function getSystemMailConfig(): {
  from: string;
  password: string;
} | null {
  const from = optional("SYSTEM_MAIL_EMAIL").trim();
  const password = optional("SYSTEM_MAIL_PASSWORD");
  if (!from || !password) return null;
  return { from, password };
}

export async function sendSystemMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const system = getSystemMailConfig();
  if (!system) {
    return {
      ok: false,
      error:
        "Password recovery email is not configured. Set SYSTEM_MAIL_EMAIL and SYSTEM_MAIL_PASSWORD.",
    };
  }

  const cfg = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: system.from,
      pass: system.password,
    },
  });

  try {
    await transporter.sendMail({
      from: `"RamerLabs Webmail" <${system.from}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      messageId: createMessageId(system.from),
      headers: {
        "X-Mailer": getMailerIdentity(),
      },
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to send email",
    };
  } finally {
    transporter.close();
  }
}

export function appBaseUrl(): string {
  const explicit = optional("NEXT_PUBLIC_APP_URL").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = optional("VERCEL_URL").trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}
