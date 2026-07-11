import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";
import {
  decryptSecret,
  encryptSecret,
  hashBackupCode,
  normalizeEmail,
} from "@/lib/auth-crypto";

export interface AuthProfile {
  email: string;
  recoveryEmail: string;
  totpEnabled: boolean;
  /** AES-GCM encrypted TOTP secret */
  totpSecretEnc?: string;
  /** scrypt hashes of backup codes */
  backupCodeHashes: string[];
  createdAt: string;
  updatedAt: string;
}

function profileKey(email: string): string {
  return `webmail:auth:${normalizeEmail(email)}`;
}

function recoveryIndexKey(recoveryEmail: string): string {
  return `webmail:recovery:${normalizeEmail(recoveryEmail)}`;
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function localStorePath(): string {
  return path.join(process.cwd(), ".data", "auth-profiles.json");
}

async function readLocalStore(): Promise<Record<string, AuthProfile>> {
  try {
    const raw = await readFile(localStorePath(), "utf8");
    return JSON.parse(raw) as Record<string, AuthProfile>;
  } catch {
    return {};
  }
}

async function writeLocalStore(
  data: Record<string, AuthProfile>,
): Promise<void> {
  const file = localStorePath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

export async function getAuthProfile(
  email: string,
): Promise<AuthProfile | null> {
  warnIfEphemeral();
  const key = profileKey(email);
  const redis = getRedis();
  if (redis) {
    const value = await redis.get<AuthProfile>(key);
    return value || null;
  }
  const store = await readLocalStore();
  return store[normalizeEmail(email)] || null;
}

/**
 * Resolve a profile from either the mailbox address or the recovery email.
 */
export async function findAuthProfileForReset(
  identifier: string,
): Promise<AuthProfile | null> {
  const input = normalizeEmail(identifier);

  const byMailbox = await getAuthProfile(input);
  if (byMailbox?.recoveryEmail) return byMailbox;

  const redis = getRedis();
  if (redis) {
    const mailbox = await redis.get<string>(recoveryIndexKey(input));
    if (mailbox) {
      const profile = await getAuthProfile(mailbox);
      if (profile?.recoveryEmail) return profile;
    }

    // Fallback for profiles saved before the recovery index existed
    const keys = await redis.keys("webmail:auth:*");
    for (const key of keys) {
      const profile = await redis.get<AuthProfile>(key);
      if (
        profile?.recoveryEmail &&
        normalizeEmail(profile.recoveryEmail) === input
      ) {
        await redis.set(recoveryIndexKey(input), normalizeEmail(profile.email));
        return profile;
      }
    }
    return byMailbox;
  }

  const store = await readLocalStore();
  const match = Object.values(store).find(
    (p) => p.recoveryEmail && normalizeEmail(p.recoveryEmail) === input,
  );
  return match || byMailbox;
}

export async function saveAuthProfile(
  profile: AuthProfile,
): Promise<AuthProfile> {
  warnIfEphemeral();
  const email = normalizeEmail(profile.email);
  const previous = await getAuthProfile(email);
  const next: AuthProfile = {
    ...profile,
    email,
    recoveryEmail: normalizeEmail(profile.recoveryEmail),
    updatedAt: new Date().toISOString(),
  };

  const redis = getRedis();
  if (redis) {
    await redis.set(profileKey(email), next);
    if (
      previous?.recoveryEmail &&
      previous.recoveryEmail !== next.recoveryEmail
    ) {
      await redis.del(recoveryIndexKey(previous.recoveryEmail));
    }
    if (next.recoveryEmail) {
      await redis.set(recoveryIndexKey(next.recoveryEmail), email);
    }
    return next;
  }

  if (process.env.VERCEL) {
    throw new Error(
      "Auth profile storage requires Upstash Redis on Vercel. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    );
  }

  const store = await readLocalStore();
  store[email] = next;
  await writeLocalStore(store);
  return next;
}

function warnIfEphemeral() {
  if (process.env.VERCEL && !getRedis()) {
    console.warn(
      "[auth-store] UPSTASH_REDIS_REST_URL/TOKEN missing — recovery email and 2FA will not persist on Vercel.",
    );
  }
}

export async function upsertAuthProfile(
  email: string,
  patch: Partial<AuthProfile> & { recoveryEmail?: string },
): Promise<AuthProfile> {
  const existing = await getAuthProfile(email);
  const now = new Date().toISOString();
  const next: AuthProfile = {
    email: normalizeEmail(email),
    recoveryEmail:
      patch.recoveryEmail !== undefined
        ? normalizeEmail(patch.recoveryEmail)
        : existing?.recoveryEmail || "",
    totpEnabled:
      patch.totpEnabled !== undefined
        ? patch.totpEnabled
        : existing?.totpEnabled || false,
    totpSecretEnc:
      patch.totpSecretEnc !== undefined
        ? patch.totpSecretEnc
        : existing?.totpSecretEnc,
    backupCodeHashes:
      patch.backupCodeHashes !== undefined
        ? patch.backupCodeHashes
        : existing?.backupCodeHashes || [],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  return saveAuthProfile(next);
}

export function setTotpSecret(plainSecret: string): string {
  return encryptSecret(plainSecret);
}

export function getTotpSecret(profile: AuthProfile): string | null {
  if (!profile.totpSecretEnc) return null;
  try {
    return decryptSecret(profile.totpSecretEnc);
  } catch {
    return null;
  }
}

export function hashCodes(codes: string[]): string[] {
  return codes.map((c) => hashBackupCode(c));
}

export async function consumeBackupCode(
  email: string,
  code: string,
): Promise<boolean> {
  const profile = await getAuthProfile(email);
  if (!profile?.backupCodeHashes?.length) return false;

  const { verifyBackupCode } = await import("@/lib/auth-crypto");
  const idx = profile.backupCodeHashes.findIndex((h) =>
    verifyBackupCode(code, h),
  );
  if (idx < 0) return false;

  const next = [...profile.backupCodeHashes];
  next.splice(idx, 1);
  await saveAuthProfile({ ...profile, backupCodeHashes: next });
  return true;
}

export function authStoreMode(): "upstash" | "local" {
  return getRedis() ? "upstash" : "local";
}
