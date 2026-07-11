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

export async function sendMail(input: SendMailInput): Promise<{
  ok: boolean;
  messageId?: string;
  error?: string;
}> {
  const cfg = getSmtpConfig();
  const messageId = createMessageId(input.from);
  const fromHeader = formatFromHeader(input.from, input.fromName);

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: input.from,
      pass: input.password,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: fromHeader,
      // Envelope sender must be the bare address for SMTP AUTH alignment
      envelope: {
        from: input.from,
        to: [
          ...input.to.split(",").map((s) => s.trim()).filter(Boolean),
          ...(input.cc
            ? input.cc.split(",").map((s) => s.trim()).filter(Boolean)
            : []),
          ...(input.bcc
            ? input.bcc.split(",").map((s) => s.trim()).filter(Boolean)
            : []),
        ],
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
    const message =
      err instanceof Error ? err.message : "Failed to send email";
    return { ok: false, error: message };
  } finally {
    transporter.close();
  }
}
