import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";
import { normalizeEmail } from "@/lib/auth-crypto";
import { getMailDomain } from "@/lib/env";

export interface AppAdminSettings {
  adsEnabled: boolean;
  /** Lacidaweb placement ID (or leave empty to use install-settings / env default). */
  adsPlacementId: string;
  /** Optional raw HTML/script embed. When set, used instead of Lacidaweb placement. */
  adsCustomHtml: string;
  signupEnabled: boolean;
  /** When false, `/` redirects guests to `/login` instead of the marketing page. */
  landingEnabled: boolean;
  /** Lowercased full mailbox addresses blocked from login/signup */
  blockedEmails: string[];
  updatedAt: string;
}

const SETTINGS_KEY = "webmail:admin:settings";

const DEFAULT_PLACEMENT =
  process.env.LACIDAWEB_PLACEMENT_ID || "cmreflbz9001gjw04x1ylhtfo";

const defaults: AppAdminSettings = {
  adsEnabled: true,
  adsPlacementId: DEFAULT_PLACEMENT,
  adsCustomHtml: "",
  signupEnabled: true,
  landingEnabled: true,
  blockedEmails: [],
  updatedAt: new Date(0).toISOString(),
};

declare global {
  // eslint-disable-next-line no-var
  var __webmailAdminSettings: AppAdminSettings | undefined;
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function localPath(): string {
  return path.join(process.cwd(), ".data", "admin-settings.json");
}

function normalizeBlockedList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const email = normalizeBlockedEmail(item);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Accept full email or local-part (appends MAIL_DOMAIN). */
export function normalizeBlockedEmail(input: string): string | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes("@")) {
    const email = normalizeEmail(raw);
    return email.includes("@") ? email : null;
  }
  try {
    const domain = getMailDomain().toLowerCase();
    return normalizeEmail(`${raw}@${domain}`);
  } catch {
    return null;
  }
}

function mergeSettings(
  value: Partial<AppAdminSettings> | null | undefined,
): AppAdminSettings {
  if (!value) return { ...defaults };
  return {
    ...defaults,
    ...value,
    signupEnabled: value.signupEnabled !== false,
    landingEnabled: value.landingEnabled !== false,
    adsEnabled: value.adsEnabled !== false,
    adsPlacementId:
      typeof value.adsPlacementId === "string" && value.adsPlacementId.trim()
        ? value.adsPlacementId.trim()
        : defaults.adsPlacementId,
    adsCustomHtml:
      typeof value.adsCustomHtml === "string" ? value.adsCustomHtml : "",
    blockedEmails: normalizeBlockedList(value.blockedEmails),
  };
}

async function readLocal(): Promise<AppAdminSettings> {
  try {
    const raw = await readFile(localPath(), "utf8");
    return mergeSettings(JSON.parse(raw) as AppAdminSettings);
  } catch {
    return { ...defaults };
  }
}

async function writeLocal(settings: AppAdminSettings): Promise<void> {
  await mkdir(path.dirname(localPath()), { recursive: true });
  await writeFile(localPath(), JSON.stringify(settings, null, 2), "utf8");
}

export function signupDisabledMessage(_domain?: string): string {
  return "Build your custom webmail @yourdomain.com — contact ramerlabs.com";
}

export const BLOCKED_EMAIL_MESSAGE =
  "This mailbox has been blocked by the administrator.";

export async function getAdminSettings(): Promise<AppAdminSettings> {
  const redis = getRedis();
  if (redis) {
    const value = await redis.get<AppAdminSettings>(SETTINGS_KEY);
    return mergeSettings(value);
  }

  if (process.env.VERCEL) {
    return mergeSettings(globalThis.__webmailAdminSettings);
  }

  return readLocal();
}

export async function isEmailBlocked(email: string): Promise<boolean> {
  const settings = await getAdminSettings();
  const normalized = normalizeEmail(email);
  return settings.blockedEmails.includes(normalized);
}

export async function saveAdminSettings(
  patch: Partial<
    Pick<
      AppAdminSettings,
      | "adsEnabled"
      | "adsPlacementId"
      | "adsCustomHtml"
      | "signupEnabled"
      | "landingEnabled"
      | "blockedEmails"
    >
  >,
): Promise<AppAdminSettings> {
  const current = await getAdminSettings();
  const next: AppAdminSettings = {
    adsEnabled:
      patch.adsEnabled !== undefined ? patch.adsEnabled : current.adsEnabled,
    adsPlacementId:
      patch.adsPlacementId !== undefined
        ? patch.adsPlacementId.trim() || defaults.adsPlacementId
        : current.adsPlacementId,
    adsCustomHtml:
      patch.adsCustomHtml !== undefined
        ? patch.adsCustomHtml
        : current.adsCustomHtml,
    signupEnabled:
      patch.signupEnabled !== undefined
        ? patch.signupEnabled
        : current.signupEnabled,
    landingEnabled:
      patch.landingEnabled !== undefined
        ? patch.landingEnabled
        : current.landingEnabled,
    blockedEmails:
      patch.blockedEmails !== undefined
        ? normalizeBlockedList(patch.blockedEmails)
        : current.blockedEmails,
    updatedAt: new Date().toISOString(),
  };

  const redis = getRedis();
  if (redis) {
    await redis.set(SETTINGS_KEY, next);
    return next;
  }

  if (process.env.VERCEL) {
    globalThis.__webmailAdminSettings = next;
    return next;
  }

  await writeLocal(next);
  return next;
}
