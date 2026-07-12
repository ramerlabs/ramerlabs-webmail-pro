import { ImapFlow } from "imapflow";
import { getImapConfig } from "@/lib/env";
import {
  createMessageId,
  formatFromHeader,
} from "@/lib/mail-headers";
import type { MailFolder, MailListItem, MailMessage } from "@/lib/mail-types";
import { extractSnippet } from "@/lib/utils";

export type { MailFolder, MailListItem, MailMessage };

function createClient(email: string, password: string) {
  const cfg = getImapConfig();
  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: email, pass: password },
    logger: false,
    // Fail fast instead of hanging the inbox UI for up to ~90s
    connectionTimeout: 15_000,
    greetingTimeout: 12_000,
    socketTimeout: 60_000,
  });
}

async function withClient<T>(
  email: string,
  password: string,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = createClient(email, password);
  try {
    await client.connect();
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

/** Verify credentials by opening an IMAP connection. */
export async function verifyImapCredentials(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await withClient(email, password, async () => undefined);
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "IMAP authentication failed";
    return { ok: false, error: message };
  }
}

const FOLDER_CANDIDATES: Record<MailFolder, string[]> = {
  INBOX: ["INBOX"],
  Sent: ["Sent", "Sent Messages", "INBOX.Sent", "Sent Items", "INBOX/Sent"],
  Drafts: ["Drafts", "INBOX.Drafts", "INBOX/Drafts"],
  Trash: ["Trash", "INBOX.Trash", "Deleted Messages", "INBOX/Trash"],
  Junk: ["Junk", "Spam", "INBOX.Junk", "INBOX/Junk", "Bulk Mail"],
  Archive: ["Archive", "INBOX.Archive", "INBOX/Archive", "Archives"],
};

const SPECIAL_USE: Partial<Record<MailFolder, string>> = {
  Sent: "\\Sent",
  Drafts: "\\Drafts",
  Trash: "\\Trash",
  Junk: "\\Junk",
  Archive: "\\Archive",
};

async function resolveMailboxPath(
  client: ImapFlow,
  folder: MailFolder,
): Promise<string> {
  if (folder === "INBOX") return "INBOX";

  try {
    const boxes = await client.list();
    const special = SPECIAL_USE[folder];
    if (special) {
      const bySpecial = boxes.find((b) => b.specialUse === special);
      if (bySpecial?.path) return bySpecial.path;
    }
    const needle = folder.toLowerCase();
    const byName = boxes.find((b) => {
      const path = b.path.toLowerCase();
      const name = (b.name || "").toLowerCase();
      return path === needle || name === needle || path.endsWith(`.${needle}`) || path.endsWith(`/${needle}`);
    });
    if (byName?.path) return byName.path;
  } catch {
    /* fall through to candidates */
  }

  return FOLDER_CANDIDATES[folder][0];
}

async function openBestMailbox(client: ImapFlow, folder: MailFolder) {
  const resolved = await resolveMailboxPath(client, folder);
  const tryNames = [
    resolved,
    ...FOLDER_CANDIDATES[folder].filter((n) => n !== resolved),
  ];

  let lastError: unknown;
  for (const name of tryNames) {
    try {
      return await client.mailboxOpen(name);
    } catch (err) {
      lastError = err;
    }
  }

  // Auto-create common folders when missing (Drafts/Sent/Trash on fresh accounts)
  if (folder !== "INBOX") {
    try {
      await client.mailboxCreate(folder);
      return await client.mailboxOpen(folder);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Mailbox for ${folder} not found`);
}

function encodeAttachmentFilename(name: string): string {
  // RFC 2231-ish simple ASCII fallback for Sent copies
  return name.replace(/[^\x20-\x7E]/g, "_");
}

function buildRfc822(options: {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  messageId?: string;
  cc?: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}): string {
  const attachments = options.attachments || [];
  const mixedBoundary = `----=_RL_MIXED_${Date.now().toString(36)}`;
  const altBoundary = `----=_RL_ALT_${Date.now().toString(36)}`;
  const fromHeader = options.from.includes("<")
    ? options.from
    : formatFromHeader(options.from);
  const bareFrom = fromHeader.match(/<([^>]+)>/)?.[1] || options.from;

  const headers = [
    `From: ${fromHeader}`,
    `To: ${options.to}`,
    options.cc ? `Cc: ${options.cc}` : null,
    `Reply-To: ${options.replyTo || bareFrom}`,
    `Subject: ${options.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${options.messageId || createMessageId(bareFrom)}`,
    `MIME-Version: 1.0`,
    `X-Mailer: RamerLabs-Webmail/1.0`,
  ].filter(Boolean) as string[];

  const textBody = options.text || "";
  const htmlBody = options.html;

  const buildAlternative = () => {
    if (!htmlBody) {
      return [
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        textBody,
      ].join("\r\n");
    }
    return [
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      "",
      `--${altBoundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      textBody || htmlBody.replace(/<[^>]+>/g, " "),
      `--${altBoundary}`,
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      htmlBody,
      `--${altBoundary}--`,
    ].join("\r\n");
  };

  if (attachments.length === 0) {
    if (htmlBody) {
      headers.push(
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      );
      return [
        ...headers,
        "",
        `--${altBoundary}`,
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        textBody || htmlBody.replace(/<[^>]+>/g, " "),
        `--${altBoundary}`,
        "Content-Type: text/html; charset=utf-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        htmlBody,
        `--${altBoundary}--`,
        "",
      ].join("\r\n");
    }
    headers.push("Content-Type: text/plain; charset=utf-8");
    headers.push("Content-Transfer-Encoding: 8bit");
    return [...headers, "", textBody, ""].join("\r\n");
  }

  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
  const parts: string[] = [...headers, "", `--${mixedBoundary}`, buildAlternative()];

  for (const file of attachments) {
    const type = file.contentType || "application/octet-stream";
    const filename = encodeAttachmentFilename(file.filename);
    parts.push(
      `--${mixedBoundary}`,
      `Content-Type: ${type}; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      file.content.toString("base64").replace(/(.{76})/g, "$1\r\n"),
    );
  }

  parts.push(`--${mixedBoundary}--`, "");
  return parts.join("\r\n");
}

/** Deliver a message into INBOX (e.g. welcome/config after signup). */
export async function appendToInbox(
  email: string,
  password: string,
  message: {
    from: string;
    fromName?: string;
    subject: string;
    text?: string;
    html?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    return await withClient(email, password, async (client) => {
      const fromHeader = message.fromName
        ? formatFromHeader(message.from, message.fromName)
        : formatFromHeader(message.from);
      const raw = buildRfc822({
        from: fromHeader,
        to: email,
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.from,
      });
      await client.append("INBOX", Buffer.from(raw, "utf8"), []);
      return { ok: true };
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to deliver welcome mail",
    };
  }
}

/** Save a copy of an outgoing message into the IMAP Sent folder. */
export async function appendToSentFolder(
  email: string,
  password: string,
  message: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    messageId?: string;
    cc?: string;
    attachments?: { filename: string; content: Buffer; contentType?: string }[];
  },
): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    return await withClient(email, password, async (client) => {
      const path = await resolveMailboxPath(client, "Sent");
      const raw = buildRfc822({
        from: email,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        messageId: message.messageId,
        cc: message.cc,
        replyTo: email,
        attachments: message.attachments,
      });

      try {
        await client.append(path, Buffer.from(raw, "utf8"), ["\\Seen"]);
        return { ok: true, path };
      } catch {
        try {
          await client.mailboxCreate("Sent");
          await client.append("Sent", Buffer.from(raw, "utf8"), ["\\Seen"]);
          return { ok: true, path: "Sent" };
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Failed to save to Sent";
          return { ok: false, error: msg };
        }
      }
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save to Sent";
    return { ok: false, error: message };
  }
}

function decodeAddress(
  addr?: { name?: string; address?: string }[] | false | null,
): { name: string; email: string } {
  if (!addr || !Array.isArray(addr) || addr.length === 0) {
    return { name: "Unknown", email: "" };
  }
  const first = addr[0];
  return {
    name: first.name || first.address || "Unknown",
    email: first.address || "",
  };
}

function headerValue(headers: string, name: string): string {
  const re = new RegExp(`^${name}:\\s*([^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*)`, "im");
  const match = headers.match(re);
  return match?.[1]?.replace(/\r?\n[ \t]+/g, " ").trim() || "";
}

function decodeQuotedPrintableToBuffer(input: string): Buffer {
  const cleaned = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    if (
      cleaned[i] === "=" &&
      i + 2 < cleaned.length &&
      /^[0-9A-Fa-f]{2}$/.test(cleaned.slice(i + 1, i + 3))
    ) {
      bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(cleaned.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function normalizeCharset(raw: string): string {
  const c = raw.trim().toLowerCase().replace(/['"]/g, "");
  if (!c || c === "utf8" || c === "utf-8") return "utf-8";
  if (c === "iso-8859-1" || c === "latin1" || c === "latin-1") return "latin1";
  if (c === "us-ascii" || c === "ascii") return "ascii";
  if (c === "windows-1252" || c === "cp1252") return "latin1";
  return c;
}

function decodeBytes(buf: Buffer, charset: string): string {
  const cs = normalizeCharset(charset);
  try {
    if (cs === "utf-8" || cs === "ascii" || cs === "latin1") {
      return buf.toString(cs as BufferEncoding);
    }
    return new TextDecoder(cs, { fatal: false }).decode(buf);
  } catch {
    return buf.toString("utf-8");
  }
}

function decodeMimePartBody(
  body: string,
  transferEncoding: string,
  charset: string,
): string {
  const enc = transferEncoding.toLowerCase().trim();
  let buf: Buffer;
  if (enc === "base64") {
    buf = Buffer.from(body.replace(/\s+/g, ""), "base64");
  } else if (enc === "quoted-printable") {
    buf = decodeQuotedPrintableToBuffer(body);
  } else {
    // 7bit / 8bit / binary — MIME source was read as binary-safe latin1 bytes
    buf = Buffer.from(body, "binary");
  }
  let text = decodeBytes(buf, charset);
  // Clean common mojibake leftovers from double-encoded UTF-8
  text = text.replace(/\u00c2\u00a0/g, "\u00a0").replace(/\u00c2([\u0080-\u00bf])/g, "$1");
  return text.replace(/\uFFFD/g, "");
}

function extractMimeParts(raw: string): { html: string | null; text: string | null } {
  const boundaryMatch = raw.match(/boundary="?([^";\r\n]+)"?/i);
  if (!boundaryMatch) {
    const headerEnd = raw.indexOf("\r\n\r\n");
    const headers = headerEnd >= 0 ? raw.slice(0, headerEnd) : "";
    const body = headerEnd >= 0 ? raw.slice(headerEnd + 4) : raw;
    const ctype = headerValue(headers, "Content-Type") || "text/plain";
    const cte = headerValue(headers, "Content-Transfer-Encoding") || "7bit";
    const charsetMatch = ctype.match(/charset\s*=\s*"?([^";\s]+)"?/i);
    const charset = charsetMatch?.[1] || "utf-8";
    const decoded = decodeMimePartBody(body, cte, charset);
    if (/text\/html/i.test(ctype) || /<html[\s>]/i.test(decoded)) {
      return { html: decoded, text: null };
    }
    return { html: null, text: decoded };
  }

  const boundary = boundaryMatch[1];
  const parts = raw.split(new RegExp(`--${escapeRegExp(boundary)}(?:--)?`));
  let html: string | null = null;
  let text: string | null = null;

  for (const part of parts) {
    if (!part || part === "--" || part.trim() === "") continue;
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd < 0) continue;
    const headers = part.slice(0, headerEnd);
    const body = part.slice(headerEnd + 4).replace(/\r?\n--\s*$/, "");
    const ctype = headerValue(headers, "Content-Type");
    if (!ctype || /multipart\//i.test(ctype)) continue;
    const cte = headerValue(headers, "Content-Transfer-Encoding") || "7bit";
    const charsetMatch = ctype.match(/charset\s*=\s*"?([^";\s]+)"?/i);
    const charset = charsetMatch?.[1] || "utf-8";
    const decoded = decodeMimePartBody(body, cte, charset);

    if (/text\/html/i.test(ctype) && !html) html = decoded.trim();
    else if (/text\/plain/i.test(ctype) && !text) text = decoded.trim();
  }

  return { html, text };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseMimeBody(
  source: Buffer | string,
): { html: string | null; text: string | null } {
  // Keep raw MIME as latin1 so QP/base64 byte sequences stay intact
  const raw =
    typeof source === "string"
      ? source
      : source.toString("latin1");

  let { html, text } = extractMimeParts(raw);

  // cPanel API welcome mail sometimes stores multipart body without a
  // top-level Content-Type header — recover by parsing the first boundary.
  if (!html && !text) {
    const orphan = raw.match(
      /^--([^\r\n]+)\r?\n([\s\S]*)$/,
    );
    if (orphan) {
      const recovered = extractMimeParts(
        `Content-Type: multipart/mixed; boundary="${orphan[1]}"\r\n\r\n${raw}`,
      );
      html = recovered.html;
      text = recovered.text;
    }
  }

  if (!html && !text) {
    const bodyStart = raw.indexOf("\r\n\r\n");
    const body = bodyStart >= 0 ? raw.slice(bodyStart + 4) : raw;
    text = decodeMimePartBody(body, "7bit", "utf-8");
  }

  return { html, text };
}

export async function fetchLatestEmails(
  email: string,
  password: string,
  options: {
    folder?: MailFolder;
    limit?: number;
    search?: string;
  } = {},
): Promise<MailListItem[]> {
  const { folder = "INBOX", limit = 50, search } = options;

  return withClient(email, password, async (client) => {
    await openBestMailbox(client, folder);

    const mailbox = client.mailbox;
    const exists = mailbox === false ? 0 : mailbox.exists;
    if (exists === 0 && !search?.trim()) return [];

    let rangeOrUids: string | number[];
    let fetchByUid = false;

    if (search?.trim()) {
      const query = search.trim();
      // Subject/from only — BODY search scans the whole mailbox and is very slow on cPanel.
      const found = await client.search(
        {
          or: [{ subject: query }, { from: query }],
        },
        { uid: true },
      );
      if (!found || found.length === 0) return [];
      rangeOrUids = found.slice(-limit);
      fetchByUid = true;
    } else {
      const start = Math.max(1, exists - limit + 1);
      rangeOrUids = `${start}:${exists}`;
    }

    const items: MailListItem[] = [];

    // Envelope + flags only — downloading MIME for every row made inbox feel stuck.
    for await (const msg of client.fetch(
      rangeOrUids,
      {
        uid: true,
        flags: true,
        envelope: true,
      },
      fetchByUid ? { uid: true } : undefined,
    )) {
      const from = decodeAddress(msg.envelope?.from);
      const to = decodeAddress(msg.envelope?.to);
      const cc = decodeAddress(msg.envelope?.cc);
      items.push({
        uid: msg.uid,
        seq: msg.seq,
        subject: msg.envelope?.subject || "(no subject)",
        from: from.name,
        fromEmail: from.email,
        to: to.name,
        toEmail: to.email,
        cc: cc.email || undefined,
        date: msg.envelope?.date
          ? new Date(msg.envelope.date).toISOString()
          : new Date().toISOString(),
        snippet: "",
        seen: msg.flags?.has("\\Seen") ?? false,
        flagged: msg.flags?.has("\\Flagged") ?? false,
      });
    }

    items.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    return items.slice(0, limit);
  });
}

export async function fetchEmailByUid(
  email: string,
  password: string,
  uid: number,
  folder: MailFolder = "INBOX",
): Promise<MailMessage | null> {
  return withClient(email, password, async (client) => {
    await openBestMailbox(client, folder);

    const msg = await client.fetchOne(
      String(uid),
      {
        uid: true,
        flags: true,
        envelope: true,
        source: true,
      },
      { uid: true },
    );

    if (msg === false) return null;

    const from = decodeAddress(msg.envelope?.from);
    const to = decodeAddress(msg.envelope?.to);
    const cc = decodeAddress(msg.envelope?.cc);
    const { html, text } = parseMimeBody(msg.source || Buffer.alloc(0));

    try {
      await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
    } catch {
      /* non-fatal */
    }

    return {
      uid: msg.uid,
      seq: msg.seq,
      subject: msg.envelope?.subject || "(no subject)",
      from: from.name,
      fromEmail: from.email,
      to: to.email || to.name,
      toEmail: to.email,
      cc: cc.email || undefined,
      date: msg.envelope?.date
        ? new Date(msg.envelope.date).toISOString()
        : new Date().toISOString(),
      snippet: extractSnippet(text || html || ""),
      seen: true,
      flagged: msg.flags?.has("\\Flagged") ?? false,
      html,
      text,
    };
  });
}

/** Save a draft into the IMAP Drafts folder. */
export async function appendToDraftsFolder(
  email: string,
  password: string,
  message: {
    to: string;
    subject: string;
    text?: string;
  },
): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    return await withClient(email, password, async (client) => {
      let path = "Drafts";
      try {
        path = await resolveMailboxPath(client, "Drafts");
      } catch {
        path = "Drafts";
      }

      const raw = buildRfc822({
        from: email,
        to: message.to || email,
        subject: message.subject || "(no subject)",
        text: message.text || "",
      });

      try {
        await client.append(path, Buffer.from(raw, "utf8"), ["\\Draft", "\\Seen"]);
        return { ok: true, path };
      } catch {
        await client.mailboxCreate("Drafts");
        await client.append("Drafts", Buffer.from(raw, "utf8"), [
          "\\Draft",
          "\\Seen",
        ]);
        return { ok: true, path: "Drafts" };
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save draft";
    return { ok: false, error: msg };
  }
}

export async function applyMailActions(
  email: string,
  password: string,
  options: {
    folder: MailFolder;
    uids: number[];
    action: "read" | "unread" | "trash" | "delete" | "junk" | "archive";
  },
): Promise<{ ok: boolean; error?: string }> {
  const { folder, uids, action } = options;
  if (uids.length === 0) return { ok: true };

  async function moveTo(
    client: ImapFlow,
    uidList: string,
    target: MailFolder,
  ) {
    const path = await resolveMailboxPath(client, target);
    try {
      await client.messageMove(uidList, path, { uid: true });
    } catch {
      await client.mailboxCreate(target);
      await client.messageMove(uidList, target, { uid: true });
    }
  }

  try {
    return await withClient(email, password, async (client) => {
      await openBestMailbox(client, folder);
      const uidList = uids.join(",");

      if (action === "read") {
        await client.messageFlagsAdd(uidList, ["\\Seen"], { uid: true });
      } else if (action === "unread") {
        await client.messageFlagsRemove(uidList, ["\\Seen"], { uid: true });
      } else if (action === "trash") {
        if (folder === "Trash") {
          await client.messageDelete(uidList, { uid: true });
        } else {
          await moveTo(client, uidList, "Trash");
        }
      } else if (action === "junk") {
        if (folder === "Junk") {
          await moveTo(client, uidList, "INBOX");
        } else {
          await moveTo(client, uidList, "Junk");
        }
      } else if (action === "archive") {
        await moveTo(client, uidList, "Archive");
      } else if (action === "delete") {
        await client.messageDelete(uidList, { uid: true });
      }

      return { ok: true };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Action failed";
    return { ok: false, error: msg };
  }
}
