import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";
import { getMailDomain } from "@/lib/env";

const ADMIN_KEY = "webmail:app:admin-user";
const DEFAULT_LOCAL_PART = "admin";
const DEFAULT_PASSWORD = "admin123";

export interface AppAdminUser {
  username: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  isDefaultPassword: boolean;
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function localPath(): string {
  return path.join(process.cwd(), ".data", "app-admin.json");
}

function hashPassword(password: string, salt?: string): string {
  const s = salt || randomBytes(16).toString("hex");
  const hash = scryptSync(password, s, 32).toString("hex");
  return `${s}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const next = scryptSync(password, salt, 32);
    const prev = Buffer.from(hash, "hex");
    if (next.length !== prev.length) return false;
    return timingSafeEqual(next, prev);
  } catch {
    return false;
  }
}

/** Default installer login: admin@{MAIL_DOMAIN}. */
export function getDefaultAdminEmail(): string {
  const domain = (getMailDomain() || "yourdomain.com").toLowerCase().trim();
  return `${DEFAULT_LOCAL_PART}@${domain}`;
}

export function getDefaultAdminPassword(): string {
  return DEFAULT_PASSWORD;
}

function normalizeLoginId(value: string): string {
  return value.trim().toLowerCase();
}

/** Accept admin, admin@domain, or matching stored username. */
export function loginMatchesAdmin(
  input: string,
  storedUsername: string,
): boolean {
  const a = normalizeLoginId(input);
  const b = normalizeLoginId(storedUsername);
  if (!a || !b) return false;
  if (a === b) return true;

  const domain = (getMailDomain() || "").toLowerCase();
  const defaultEmail = getDefaultAdminEmail().toLowerCase();
  const aliases = new Set<string>([b, defaultEmail, DEFAULT_LOCAL_PART]);
  if (domain) aliases.add(`${DEFAULT_LOCAL_PART}@${domain}`);
  if (b.includes("@")) aliases.add(b.split("@")[0]!);
  return aliases.has(a);
}

async function readLocal(): Promise<AppAdminUser | null> {
  try {
    const raw = await readFile(localPath(), "utf8");
    return JSON.parse(raw) as AppAdminUser;
  } catch {
    return null;
  }
}

async function writeLocal(user: AppAdminUser): Promise<void> {
  await mkdir(path.dirname(localPath()), { recursive: true });
  await writeFile(localPath(), JSON.stringify(user, null, 2), "utf8");
}

async function loadStored(): Promise<AppAdminUser | null> {
  const redis = getRedis();
  if (redis) {
    const value = await redis.get<AppAdminUser>(ADMIN_KEY);
    if (value?.username && value.passwordHash) return value;
    return null;
  }
  if (process.env.VERCEL) {
    const mem = (globalThis as { __webmailAppAdmin?: AppAdminUser })
      .__webmailAppAdmin;
    if (mem?.username && mem.passwordHash) return mem;
    return null;
  }
  return readLocal();
}

export async function getAppAdminUser(): Promise<AppAdminUser> {
  const desired = getDefaultAdminEmail();
  const existing = await loadStored();

  if (existing?.username && existing.passwordHash) {
    // Migrate legacy "admin" → admin@domain while still on default password
    if (
      existing.isDefaultPassword &&
      normalizeLoginId(existing.username) === DEFAULT_LOCAL_PART &&
      normalizeLoginId(desired) !== DEFAULT_LOCAL_PART
    ) {
      const migrated: AppAdminUser = {
        ...existing,
        username: desired,
      };
      await saveAppAdminUser(migrated);
      return migrated;
    }
    return existing;
  }

  const now = new Date().toISOString();
  const user: AppAdminUser = {
    username: desired,
    passwordHash: hashPassword(DEFAULT_PASSWORD),
    createdAt: now,
    updatedAt: now,
    isDefaultPassword: true,
  };
  await saveAppAdminUser(user);
  return user;
}

export async function saveAppAdminUser(user: AppAdminUser): Promise<void> {
  const next = { ...user, updatedAt: new Date().toISOString() };
  const redis = getRedis();
  if (redis) {
    await redis.set(ADMIN_KEY, next);
    return;
  }
  if (process.env.VERCEL) {
    (globalThis as { __webmailAppAdmin?: AppAdminUser }).__webmailAppAdmin =
      next;
    return;
  }
  await writeLocal(next);
}

export async function ensureDefaultAppAdmin(): Promise<AppAdminUser> {
  return getAppAdminUser();
}

export async function verifyAppAdmin(
  username: string,
  password: string,
): Promise<AppAdminUser | null> {
  const user = await getAppAdminUser();
  if (!loginMatchesAdmin(username, user.username)) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return user;
}

export async function changeAppAdminPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getAppAdminUser();
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    return { ok: false, error: "Current password is incorrect." };
  }
  if (newPassword.length < 8) {
    return { ok: false, error: "New password must be at least 8 characters." };
  }
  await saveAppAdminUser({
    ...user,
    passwordHash: hashPassword(newPassword),
    isDefaultPassword: false,
  });
  return { ok: true };
}

export function fingerprintSessionSecret(): string {
  return createHash("sha256")
    .update(process.env.SESSION_SECRET || "webmail-pro")
    .digest("hex")
    .slice(0, 16);
}
