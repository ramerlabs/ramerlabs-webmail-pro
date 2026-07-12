import nodemailer from "nodemailer";
import { getSmtpConfig } from "@/lib/env";
import {
  createMessageId,
  formatFromHeader,
  getMailerIdentity,
} from "@/lib/mail-headers";

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendMailInput {
  from: string;
  password: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  cc?: string;
  bcc?: string;
  attachments?: MailAttachment[];
  /** Optional override for From display name */
  fromName?: string;
}

function formatSmtpError(err: unknown): string {
  if (!(err instanceof Error)) return "Failed to send email";

  const extra = err as Error & {
    response?: string;
    responseCode?: number;
    code?: string;
  };
  const detail = [extra.response, extra.message].filter(Boolean).join(" ");
  const lower = detail.toLowerCase();

  if (
    lower.includes("sender verify") ||
    lower.includes("550") ||
    lower.includes("553") ||
    lower.includes("relay")
  ) {
    return `${detail} — For addon domains, set cPanel → Email → Email Routing to Local Mail Exchanger (Admin → Load domains / Save will try to fix this).`;
  }
  if (
    lower.includes("invalid login") ||
    lower.includes("authentication") ||
    lower.includes("535")
  ) {
    return `${detail} — Check the mailbox password, or reconnect by logging out and back in.`;
  }
  return detail || "Failed to send email";
}

function buildTransporter(
  host: string,
  port: number,
  secure: boolean,
  user: string,
  pass: string,
) {
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 15_000,
    greetingTimeout: 12_000,
    socketTimeout: 60_000,
    tls: {
      // SNI: important when host is mail.primary.com but auth user is @addon.com
      servername: host,
    },
  });
}

export async function sendMail(input: SendMailInput): Promise<{
  ok: boolean;
  messageId?: string;
  error?: string;
}> {
  const cfg = getSmtpConfig();
  const messageId = createMessageId(input.from);
  const fromHeader = formatFromHeader(input.from, input.fromName);
  const fromDomain = input.from.split("@")[1]?.toLowerCase() || "";

  const hosts = [cfg.host];
  if (fromDomain) {
    const alt = `mail.${fromDomain}`;
    if (!hosts.includes(alt)) hosts.push(alt);
  }

  const envelopeTo = [
    ...input.to.split(",").map((s) => s.trim()).filter(Boolean),
    ...(input.cc
      ? input.cc.split(",").map((s) => s.trim()).filter(Boolean)
      : []),
    ...(input.bcc
      ? input.bcc.split(",").map((s) => s.trim()).filter(Boolean)
      : []),
  ];

  let lastError = "Failed to send email";

  for (const host of hosts) {
    const transporter = buildTransporter(
      host,
      cfg.port,
      cfg.secure,
      input.from,
      input.password,
    );

    try {
      const info = await transporter.sendMail({
        from: fromHeader,
        // Envelope sender must be the bare address for SMTP AUTH alignment
        envelope: {
          from: input.from,
          to: envelopeTo,
        },
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        replyTo: input.from,
        subject: input.subject,
        text: input.text,
        html: input.html,
        messageId,
        date: new Date(),
        headers: {
          "X-Mailer": getMailerIdentity(),
          "X-Originating-Client": getMailerIdentity(),
        },
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });

      return { ok: true, messageId: info.messageId || messageId };
    } catch (err) {
      lastError = formatSmtpError(err);
      // Only try the next host for connection/auth failures — not for
      // recipient rejects after a successful handshake on the primary host.
      const lower = lastError.toLowerCase();
      const tryNext =
        lower.includes("connection") ||
        lower.includes("timeout") ||
        lower.includes("econn") ||
        lower.includes("authentication") ||
        lower.includes("invalid login") ||
        lower.includes("535");
      if (!tryNext) break;
    } finally {
      transporter.close();
    }
  }

  return { ok: false, error: lastError };
}
