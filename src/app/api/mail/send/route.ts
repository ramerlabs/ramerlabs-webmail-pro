import { NextResponse } from "next/server";
import { appendToSentFolder } from "@/lib/imap";
import { sendMail, type MailAttachment } from "@/lib/smtp";
import { getSettings, requireSession } from "@/lib/session";
import { sendMailSchema } from "@/lib/validations";

export const runtime = "nodejs";

const MAX_FILES = 5;
const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB each
const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // 4 MB total (Vercel body limit)

async function parseAttachments(
  form: FormData,
): Promise<{ ok: true; files: MailAttachment[] } | { ok: false; error: string }> {
  const files: MailAttachment[] = [];
  let total = 0;

  for (const entry of form.getAll("attachments")) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    if (files.length >= MAX_FILES) {
      return { ok: false, error: `Maximum ${MAX_FILES} attachments allowed.` };
    }
    if (entry.size > MAX_FILE_BYTES) {
      return {
        ok: false,
        error: `"${entry.name}" is too large (max 3 MB per file).`,
      };
    }
    total += entry.size;
    if (total > MAX_TOTAL_BYTES) {
      return {
        ok: false,
        error: "Attachments exceed the 4 MB total limit.",
      };
    }
    const buffer = Buffer.from(await entry.arrayBuffer());
    files.push({
      filename: entry.name || "attachment",
      content: buffer,
      contentType: entry.type || "application/octet-stream",
    });
  }

  return { ok: true, files };
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    let to: string;
    let subject: string;
    let messageBody: string;
    let html = false;
    let cc: string | undefined;
    let bcc: string | undefined;
    let attachments: MailAttachment[] = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const parsed = sendMailSchema.safeParse({
        to: String(form.get("to") || ""),
        subject: String(form.get("subject") || ""),
        body: String(form.get("body") || ""),
        html: form.get("html") === "true",
        cc: String(form.get("cc") || ""),
        bcc: String(form.get("bcc") || ""),
      });
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Invalid input" },
          { status: 400 },
        );
      }
      to = parsed.data.to;
      subject = parsed.data.subject;
      messageBody = parsed.data.body;
      html = Boolean(parsed.data.html);
      cc = parsed.data.cc || undefined;
      bcc = parsed.data.bcc || undefined;

      const files = await parseAttachments(form);
      if (!files.ok) {
        return NextResponse.json({ error: files.error }, { status: 400 });
      }
      attachments = files.files;
    } else {
      const body = await request.json();
      const parsed = sendMailSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Invalid input" },
          { status: 400 },
        );
      }
      to = parsed.data.to;
      subject = parsed.data.subject;
      messageBody = parsed.data.body;
      html = Boolean(parsed.data.html);
      cc = parsed.data.cc || undefined;
      bcc = parsed.data.bcc || undefined;
    }

    const settings = getSettings(session);
    const result = await sendMail({
      from: session.email,
      password: session.password,
      to,
      subject,
      text: html ? undefined : messageBody,
      html: html ? messageBody : undefined,
      cc,
      bcc,
      attachments,
      fromName: settings.displayName || undefined,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to send" },
        { status: 502 },
      );
    }

    const saved = await appendToSentFolder(session.email, session.password, {
      to,
      subject,
      text: html ? undefined : messageBody,
      html: html ? messageBody : undefined,
      messageId: result.messageId,
      cc,
      attachments,
    });

    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
      attachmentCount: attachments.length,
      savedToSent: saved.ok,
      sentFolder: saved.path,
      sentWarning: saved.ok
        ? undefined
        : saved.error || "Sent copy could not be saved",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send mail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
