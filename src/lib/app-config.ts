import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";

/** Runtime settings editable from Admin (env used as initial defaults). */
export interface AppRuntimeConfig {
  mailDomain: string;
  nextPublicAppUrl: string;
  adminEmails: string;
  sessionSecret: string;
  cpanelHost: string;
  cpanelPort: string;
  cpanelUsername: string;
  cpanelApiToken: string;
  cpanelMailboxQuotaMb: string;
  imapHost: string;
  imapPort: string;
  imapSecure: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: string;
  mailFromName: string;
  systemMailEmail: string;
  systemMailPassword: string;
  davServerUrl: string;
  captchaProvider: string;
  turnstileSiteKey: string;
  turnstileSecretKey: string;
  upstashRedisRestUrl: string;
  upstashRedisRestToken: string;
  lacidawebPlacementId: string;
  updatedAt: string;
}

const CONFIG_KEY = "webmail:app:runtime-config";

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export function defaultRuntimeConfig(): AppRuntimeConfig {
  return {
    mailDomain: env("MAIL_DOMAIN"),
    nextPublicAppUrl: env("NEXT_PUBLIC_APP_URL"),
    adminEmails: env("ADMIN_EMAILS"),
    sessionSecret: env("SESSION_SECRET"),
    cpanelHost: env("CPANEL_HOST"),
    cpanelPort: env("CPANEL_PORT", "2083"),
    cpanelUsername: env("CPANEL_USERNAME"),
    cpanelApiToken: env("CPANEL_API_TOKEN"),
    cpanelMailboxQuotaMb: env("CPANEL_MAILBOX_QUOTA_MB", "500"),
    imapHost: env("IMAP_HOST"),
    imapPort: env("IMAP_PORT", "993"),
    imapSecure: env("IMAP_SECURE", "true"),
    smtpHost: env("SMTP_HOST"),
    smtpPort: env("SMTP_PORT", "465"),
    smtpSecure: env("SMTP_SECURE", "true"),
    mailFromName: env("MAIL_FROM_NAME"),
    systemMailEmail: env("SYSTEM_MAIL_EMAIL"),
    systemMailPassword: env("SYSTEM_MAIL_PASSWORD"),
    davServerUrl: env("DAV_SERVER_URL"),
    captchaProvider: env("CAPTCHA_PROVIDER", "turnstile"),
    turnstileSiteKey: env("NEXT_PUBLIC_TURNSTILE_SITE_KEY"),
    turnstileSecretKey: env("TURNSTILE_SECRET_KEY"),
    upstashRedisRestUrl: env("UPSTASH_REDIS_REST_URL"),
    upstashRedisRestToken: env("UPSTASH_REDIS_REST_TOKEN"),
    lacidawebPlacementId: env(
      "LACIDAWEB_PLACEMENT_ID",
      "cmreflbz9001gjw04x1ylhtfo",
    ),
    updatedAt: new Date(0).toISOString(),
  };
}

function getRedisFromEnv(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function localPath(): string {
  return path.join(process.cwd(), ".data", "runtime-config.json");
}

declare global {
  // eslint-disable-next-line no-var
  var __webmailRuntimeConfig: AppRuntimeConfig | undefined;
}

async function readLocal(): Promise<AppRuntimeConfig | null> {
  try {
    const raw = await readFile(localPath(), "utf8");
    return JSON.parse(raw) as AppRuntimeConfig;
  } catch {
    return null;
  }
}

async function writeLocal(config: AppRuntimeConfig): Promise<void> {
  await mkdir(path.dirname(localPath()), { recursive: true });
  await writeFile(localPath(), JSON.stringify(config, null, 2), "utf8");
}

export async function getRuntimeConfig(): Promise<AppRuntimeConfig> {
  const defaults = defaultRuntimeConfig();
  const redis = getRedisFromEnv();
  if (redis) {
    const value = await redis.get<AppRuntimeConfig>(CONFIG_KEY);
    if (!value) return defaults;
    return { ...defaults, ...value };
  }
  if (process.env.VERCEL) {
    return { ...defaults, ...(globalThis.__webmailRuntimeConfig || {}) };
  }
  const local = await readLocal();
  return local ? { ...defaults, ...local } : defaults;
}

export async function saveRuntimeConfig(
  patch: Partial<AppRuntimeConfig>,
): Promise<AppRuntimeConfig> {
  const current = await getRuntimeConfig();
  const next: AppRuntimeConfig = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  const redis = getRedisFromEnv();
  if (redis) {
    await redis.set(CONFIG_KEY, next);
    return next;
  }
  if (process.env.VERCEL) {
    globalThis.__webmailRuntimeConfig = next;
    return next;
  }
  await writeLocal(next);
  return next;
}

/** Apply runtime config into process.env for legacy helpers (best-effort). */
export async function hydrateProcessEnvFromConfig(): Promise<AppRuntimeConfig> {
  const cfg = await getRuntimeConfig();
  const map: Record<string, string> = {
    MAIL_DOMAIN: cfg.mailDomain,
    NEXT_PUBLIC_APP_URL: cfg.nextPublicAppUrl,
    ADMIN_EMAILS: cfg.adminEmails,
    SESSION_SECRET: cfg.sessionSecret,
    CPANEL_HOST: cfg.cpanelHost,
    CPANEL_PORT: cfg.cpanelPort,
    CPANEL_USERNAME: cfg.cpanelUsername,
    CPANEL_API_TOKEN: cfg.cpanelApiToken,
    CPANEL_MAILBOX_QUOTA_MB: cfg.cpanelMailboxQuotaMb,
    IMAP_HOST: cfg.imapHost,
    IMAP_PORT: cfg.imapPort,
    IMAP_SECURE: cfg.imapSecure,
    SMTP_HOST: cfg.smtpHost,
    SMTP_PORT: cfg.smtpPort,
    SMTP_SECURE: cfg.smtpSecure,
    MAIL_FROM_NAME: cfg.mailFromName,
    SYSTEM_MAIL_EMAIL: cfg.systemMailEmail,
    SYSTEM_MAIL_PASSWORD: cfg.systemMailPassword,
    DAV_SERVER_URL: cfg.davServerUrl,
    CAPTCHA_PROVIDER: cfg.captchaProvider,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: cfg.turnstileSiteKey,
    TURNSTILE_SECRET_KEY: cfg.turnstileSecretKey,
    UPSTASH_REDIS_REST_URL: cfg.upstashRedisRestUrl,
    UPSTASH_REDIS_REST_TOKEN: cfg.upstashRedisRestToken,
    LACIDAWEB_PLACEMENT_ID: cfg.lacidawebPlacementId,
  };
  for (const [key, value] of Object.entries(map)) {
    if (value) process.env[key] = value;
  }
  return cfg;
}

const SECRET_MASK = "••••••••";

export function publicRuntimeConfig(cfg: AppRuntimeConfig) {
  return {
    ...cfg,
    sessionSecret: cfg.sessionSecret ? SECRET_MASK : "",
    cpanelApiToken: cfg.cpanelApiToken ? SECRET_MASK : "",
    systemMailPassword: cfg.systemMailPassword ? SECRET_MASK : "",
    turnstileSecretKey: cfg.turnstileSecretKey ? SECRET_MASK : "",
    upstashRedisRestToken: cfg.upstashRedisRestToken ? SECRET_MASK : "",
  };
}

/** Ignore masked placeholders so PUT does not wipe secrets. */
export function applyConfigPatch(
  current: AppRuntimeConfig,
  patch: Partial<AppRuntimeConfig>,
): AppRuntimeConfig {
  const next = { ...current };
  const secretKeys: (keyof AppRuntimeConfig)[] = [
    "sessionSecret",
    "cpanelApiToken",
    "systemMailPassword",
    "turnstileSecretKey",
    "upstashRedisRestToken",
  ];
  for (const [key, value] of Object.entries(patch) as [
    keyof AppRuntimeConfig,
    string | undefined,
  ][]) {
    if (value === undefined) continue;
    if (secretKeys.includes(key) && (value === SECRET_MASK || value === "")) {
      continue;
    }
    (next as Record<string, string>)[key] = value;
  }
  next.updatedAt = new Date().toISOString();
  return next;
}
