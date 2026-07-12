import { NextResponse } from "next/server";
import { z } from "zod";
import {
  applyConfigPatch,
  getRuntimeConfig,
  publicRuntimeConfig,
  saveRuntimeConfig,
  type AppRuntimeConfig,
} from "@/lib/app-config";
import { requireAdminAccess } from "@/lib/session";

export const runtime = "nodejs";

const configSchema = z.object({
  mailDomain: z.string().optional(),
  mailDomains: z.string().optional(),
  nextPublicAppUrl: z.string().optional(),
  adminEmails: z.string().optional(),
  sessionSecret: z.string().optional(),
  cpanelHost: z.string().optional(),
  cpanelPort: z.string().optional(),
  cpanelUsername: z.string().optional(),
  cpanelApiToken: z.string().optional(),
  cpanelMailboxQuotaMb: z.string().optional(),
  imapHost: z.string().optional(),
  imapPort: z.string().optional(),
  imapSecure: z.string().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.string().optional(),
  smtpSecure: z.string().optional(),
  mailFromName: z.string().optional(),
  systemMailEmail: z.string().optional(),
  systemMailPassword: z.string().optional(),
  davServerUrl: z.string().optional(),
  captchaProvider: z.string().optional(),
  turnstileSiteKey: z.string().optional(),
  turnstileSecretKey: z.string().optional(),
  upstashRedisRestUrl: z.string().optional(),
  upstashRedisRestToken: z.string().optional(),
  lacidawebPlacementId: z.string().optional(),
});

export async function GET() {
  const session = await requireAdminAccess();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cfg = await getRuntimeConfig();
  return NextResponse.json({ config: publicRuntimeConfig(cfg) });
}

export async function PUT(request: Request) {
  const session = await requireAdminAccess();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = configSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    const current = await getRuntimeConfig();
    const merged = applyConfigPatch(
      current,
      parsed.data as Partial<AppRuntimeConfig>,
    );
    const saved = await saveRuntimeConfig(merged);

    // Apply immediately for this process
    const map: Record<string, string> = {
      MAIL_DOMAIN: saved.mailDomain,
      NEXT_PUBLIC_APP_URL: saved.nextPublicAppUrl,
      ADMIN_EMAILS: saved.adminEmails,
      SESSION_SECRET: saved.sessionSecret,
      CPANEL_HOST: saved.cpanelHost,
      CPANEL_PORT: saved.cpanelPort,
      CPANEL_USERNAME: saved.cpanelUsername,
      CPANEL_API_TOKEN: saved.cpanelApiToken,
      CPANEL_MAILBOX_QUOTA_MB: saved.cpanelMailboxQuotaMb,
      IMAP_HOST: saved.imapHost,
      IMAP_PORT: saved.imapPort,
      IMAP_SECURE: saved.imapSecure,
      SMTP_HOST: saved.smtpHost,
      SMTP_PORT: saved.smtpPort,
      SMTP_SECURE: saved.smtpSecure,
      MAIL_FROM_NAME: saved.mailFromName,
      SYSTEM_MAIL_EMAIL: saved.systemMailEmail,
      SYSTEM_MAIL_PASSWORD: saved.systemMailPassword,
      DAV_SERVER_URL: saved.davServerUrl,
      CAPTCHA_PROVIDER: saved.captchaProvider,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: saved.turnstileSiteKey,
      TURNSTILE_SECRET_KEY: saved.turnstileSecretKey,
      UPSTASH_REDIS_REST_URL: saved.upstashRedisRestUrl,
      UPSTASH_REDIS_REST_TOKEN: saved.upstashRedisRestToken,
      LACIDAWEB_PLACEMENT_ID: saved.lacidawebPlacementId,
    };
    for (const [key, value] of Object.entries(map)) {
      if (value) process.env[key] = value;
    }

    return NextResponse.json({
      ok: true,
      config: publicRuntimeConfig(saved),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save configuration";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
