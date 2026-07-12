import { randomBytes } from "crypto";
import { Redis } from "@upstash/redis";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import {
  addPopMailbox,
  changeMailboxPassword,
  listMailboxesWithDisk,
} from "@/lib/cpanel";
import { encryptSecret, decryptSecret } from "@/lib/auth-crypto";
import { getMailDomain } from "@/lib/env";
import { verifyImapCredentials } from "@/lib/imap";

const SECRET_KEY = "webmail:app:admin-mailbox-pass";

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function localPath(): string {
  return path.join(process.cwd(), ".data", "admin-mailbox.json");
}

async function loadStoredPassword(): Promise<string | null> {
  try {
    const redis = getRedis();
    if (redis) {
      const value = await redis.get<{ enc?: string } | string>(SECRET_KEY);
      if (!value) return null;
      const enc = typeof value === "string" ? value : value.enc;
      if (!enc) return null;
      return decryptSecret(enc);
    }
    if (process.env.VERCEL) {
      const mem = (globalThis as { __webmailAdminMailboxPass?: string })
        .__webmailAdminMailboxPass;
      return mem || null;
    }
    const raw = await readFile(localPath(), "utf8");
    const parsed = JSON.parse(raw) as { enc?: string };
    if (!parsed.enc) return null;
    return decryptSecret(parsed.enc);
  } catch {
    return null;
  }
}

async function saveStoredPassword(password: string): Promise<void> {
  const enc = encryptSecret(password);
  const redis = getRedis();
  if (redis) {
    await redis.set(SECRET_KEY, { enc });
    return;
  }
  if (process.env.VERCEL) {
    (globalThis as { __webmailAdminMailboxPass?: string }).__webmailAdminMailboxPass =
      password;
    return;
  }
  await mkdir(path.dirname(localPath()), { recursive: true });
  await writeFile(localPath(), JSON.stringify({ enc }, null, 2), "utf8");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWeakPasswordError(message: string): boolean {
  return /password|strength|weak|security|complexity|dictionary/i.test(
    message,
  );
}

function isExistsError(message: string): boolean {
  return /exist|already|in use|duplicate/i.test(message);
}

/** cPanel-friendly password when installer default is too weak. */
export function strongMailboxPassword(seed?: string): string {
  const base = (seed || "Admin").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "Admin";
  return `${base}Aa1!${randomBytes(4).toString("hex")}`;
}

export function friendlyImapError(raw?: string): string {
  const msg = (raw || "").trim() || "IMAP authentication failed";
  if (/command failed/i.test(msg)) {
    return (
      "Mailbox login failed. The account may not exist yet, or the password does not match cPanel. " +
      "We will try to create or sync admin@ automatically."
    );
  }
  if (/auth|invalid credentials|login failed|authentication/i.test(msg)) {
    return "IMAP rejected this password. Check the mailbox password in cPanel.";
  }
  if (/timeout|ECONN|ENOTFOUND|certificate|TLS|SSL/i.test(msg)) {
    return (
      "Could not reach the IMAP server. Check Install settings (IMAP host/port) and that remote IMAP is allowed."
    );
  }
  return msg;
}

async function tryImap(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await verifyImapCredentials(email, password);
  if (result.ok) return { ok: true };
  return { ok: false, error: friendlyImapError(result.error) };
}

async function mailboxExists(email: string): Promise<boolean | null> {
  try {
    const listed = await listMailboxesWithDisk();
    if (!listed.ok) return null;
    const target = email.toLowerCase();
    return listed.mailboxes.some((m) => m.email.toLowerCase() === target);
  } catch {
    return null;
  }
}

async function provisionMailbox(
  email: string,
  password: string,
): Promise<{ ok: boolean; password: string; error?: string }> {
  const [localPart] = email.toLowerCase().split("@");
  if (!localPart) {
    return { ok: false, password, error: "Invalid admin email" };
  }

  const domain = getMailDomain();
  if (!email.toLowerCase().endsWith(`@${domain.toLowerCase()}`)) {
    return {
      ok: false,
      password,
      error: `Admin email must be on @${domain}`,
    };
  }

  let workingPassword = password;
  let created = await addPopMailbox(localPart, workingPassword);

  if (!created.ok && isWeakPasswordError(created.error || "")) {
    workingPassword = strongMailboxPassword(localPart);
    created = await addPopMailbox(localPart, workingPassword);
  }

  if (!created.ok && isExistsError(created.error || "")) {
    let changed = await changeMailboxPassword(email, workingPassword);
    if (!changed.ok && isWeakPasswordError(changed.error || "")) {
      workingPassword = strongMailboxPassword(localPart);
      changed = await changeMailboxPassword(email, workingPassword);
    }
    if (!changed.ok) {
      // Mailbox may already use a different password — try stored secret later
      return {
        ok: false,
        password: workingPassword,
        error: changed.error || created.error,
      };
    }
  } else if (!created.ok) {
    const exists = await mailboxExists(email);
    if (exists) {
      let changed = await changeMailboxPassword(email, workingPassword);
      if (!changed.ok && isWeakPasswordError(changed.error || "")) {
        workingPassword = strongMailboxPassword(localPart);
        changed = await changeMailboxPassword(email, workingPassword);
      }
      if (!changed.ok) {
        return {
          ok: false,
          password: workingPassword,
          error: changed.error || created.error,
        };
      }
    } else {
      return {
        ok: false,
        password: workingPassword,
        error: created.error || "Could not create admin mailbox in cPanel",
      };
    }
  }

  for (let i = 0; i < 4; i++) {
    if (i > 0) await sleep(700);
    const verify = await tryImap(email, workingPassword);
    if (verify.ok) {
      await saveStoredPassword(workingPassword);
      return { ok: true, password: workingPassword };
    }
  }

  return {
    ok: false,
    password: workingPassword,
    error:
      "Mailbox was created/updated in cPanel, but IMAP is not accepting it yet. Wait a minute and try again, or check IMAP host settings.",
  };
}

/**
 * Make sure admin@ can use Mail like a normal mailbox.
 * Tries login password, then stored IMAP secret, then cPanel create/sync.
 */
export async function ensureAdminMailboxAccess(
  email: string,
  loginPassword: string,
): Promise<{ ok: boolean; password?: string; error?: string }> {
  const normalized = email.trim().toLowerCase();

  const direct = await tryImap(normalized, loginPassword);
  if (direct.ok) {
    await saveStoredPassword(loginPassword);
    return { ok: true, password: loginPassword };
  }

  const stored = await loadStoredPassword();
  if (stored && stored !== loginPassword) {
    const storedOk = await tryImap(normalized, stored);
    if (storedOk.ok) {
      return { ok: true, password: stored };
    }
  }

  const provisioned = await provisionMailbox(normalized, loginPassword);
  if (provisioned.ok) {
    return { ok: true, password: provisioned.password };
  }

  return {
    ok: false,
    error:
      provisioned.error ||
      direct.error ||
      "Could not connect admin mailbox for IMAP.",
  };
}
