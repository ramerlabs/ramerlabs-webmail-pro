import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";
import { getInstallId, validateLicense } from "@/lib/license-client";
import { LICENSE_INACTIVE_MESSAGE } from "@/lib/rlm-internal";

const LICENSE_KEY = "webmail:app:license";

export interface AppLicenseState {
  licenseKey: string;
  installId: string;
  activated: boolean;
  lastValidatedAt: string | null;
  lastMessage: string | null;
  updatedAt: string;
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function localPath(): string {
  return path.join(process.cwd(), ".data", "license.json");
}

declare global {
  // eslint-disable-next-line no-var
  var __webmailLicense: AppLicenseState | undefined;
}

function emptyState(): AppLicenseState {
  return {
    licenseKey: "",
    installId: getInstallId(null),
    activated: false,
    lastValidatedAt: null,
    lastMessage: null,
    updatedAt: new Date(0).toISOString(),
  };
}

async function readLocal(): Promise<AppLicenseState | null> {
  try {
    const raw = await readFile(localPath(), "utf8");
    return JSON.parse(raw) as AppLicenseState;
  } catch {
    return null;
  }
}

async function writeLocal(state: AppLicenseState): Promise<void> {
  await mkdir(path.dirname(localPath()), { recursive: true });
  await writeFile(localPath(), JSON.stringify(state, null, 2), "utf8");
}

export async function getLicenseState(): Promise<AppLicenseState> {
  const redis = getRedis();
  if (redis) {
    const value = await redis.get<AppLicenseState>(LICENSE_KEY);
    return value ? { ...emptyState(), ...value } : emptyState();
  }
  if (process.env.VERCEL) {
    return globalThis.__webmailLicense
      ? { ...emptyState(), ...globalThis.__webmailLicense }
      : emptyState();
  }
  const local = await readLocal();
  return local ? { ...emptyState(), ...local } : emptyState();
}

export async function saveLicenseState(
  state: AppLicenseState,
): Promise<AppLicenseState> {
  const next = { ...state, updatedAt: new Date().toISOString() };
  const redis = getRedis();
  if (redis) {
    await redis.set(LICENSE_KEY, next);
    return next;
  }
  if (process.env.VERCEL) {
    globalThis.__webmailLicense = next;
    return next;
  }
  await writeLocal(next);
  return next;
}

export async function isLicenseActive(): Promise<boolean> {
  const state = await getLicenseState();
  if (!state.licenseKey || !state.activated) return false;

  // Re-validate at most every 12 hours
  if (state.lastValidatedAt) {
    const age = Date.now() - new Date(state.lastValidatedAt).getTime();
    if (age < 12 * 60 * 60 * 1000) return true;
  }

  const result = await validateLicense(state.licenseKey, state.installId);

  // Network / server glitches must not wipe an already-activated license
  if (
    !result.success &&
    (result.code === "network_error" || result.code === "http_error")
  ) {
    await saveLicenseState({
      ...state,
      lastValidatedAt: new Date().toISOString(),
      lastMessage: result.message || "Could not reach license server (kept active)",
    });
    return true;
  }

  const next = await saveLicenseState({
    ...state,
    activated: Boolean(result.success),
    lastValidatedAt: new Date().toISOString(),
    lastMessage: result.message || (result.success ? "Valid" : "Invalid"),
  });
  return next.activated;
}

export async function requireActiveLicense(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const active = await isLicenseActive();
  if (active) return { ok: true };
  return { ok: false, message: LICENSE_INACTIVE_MESSAGE };
}
