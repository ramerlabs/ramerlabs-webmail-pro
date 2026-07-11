import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import { getSessionSecret } from "@/lib/env";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashBackupCode(code: string): string {
  const normalized = code.replace(/\s+/g, "").toUpperCase();
  const salt = createHash("sha256")
    .update(`backup:${getSessionSecret()}`)
    .digest()
    .subarray(0, 16);
  return scryptSync(normalized, salt, 32).toString("hex");
}

export function verifyBackupCode(code: string, hash: string): boolean {
  try {
    const a = Buffer.from(hashBackupCode(code), "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(5).toString("hex").toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`);
  }
  return codes;
}

export function signPayload(
  payload: Record<string, unknown>,
  ttlSec: number,
): string {
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const data = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = createHmac("sha256", getSessionSecret())
    .update(data)
    .digest("base64url");
  return `${data}.${sig}`;
}

export function verifySignedPayload<T extends Record<string, unknown>>(
  token: string,
): T | null {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = createHmac("sha256", getSessionSecret())
    .update(data)
    .digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const body = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8"),
    ) as T & { exp?: number };
    if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

export function encryptSecret(plain: string): string {
  const key = createHash("sha256").update(getSessionSecret()).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, "base64url");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const key = createHash("sha256").update(getSessionSecret()).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
