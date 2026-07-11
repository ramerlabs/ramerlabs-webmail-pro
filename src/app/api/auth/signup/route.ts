import { NextResponse } from "next/server";
import {
  getAdminSettings,
  signupDisabledMessage,
} from "@/lib/admin-settings";
import { upsertAuthProfile } from "@/lib/auth-store";
import { addPopMailbox } from "@/lib/cpanel";
import { verifyCaptcha } from "@/lib/captcha";
import { getMailDomain } from "@/lib/env";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { signupSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const domain = getMailDomain();
    const adminSettings = await getAdminSettings();
    if (adminSettings.signupEnabled === false) {
      return NextResponse.json(
        { error: signupDisabledMessage(domain) },
        { status: 403 },
      );
    }

    const ip = getClientIp(request);
    const limited = rateLimit({
      key: `signup:${ip}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    if (!limited.ok) {
      return NextResponse.json(
        {
          error: `Too many signup attempts. Try again in ${limited.retryAfterSec}s.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec) },
        },
      );
    }

    const body = await request.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    const { username, password, recoveryEmail, captchaToken } = parsed.data;
    const email = `${username.toLowerCase()}@${domain}`.toLowerCase();

    const { isEmailBlocked, BLOCKED_EMAIL_MESSAGE } = await import(
      "@/lib/admin-settings"
    );
    if (await isEmailBlocked(email)) {
      return NextResponse.json(
        { error: BLOCKED_EMAIL_MESSAGE },
        { status: 403 },
      );
    }

    if (recoveryEmail.toLowerCase() === email) {
      return NextResponse.json(
        {
          error:
            "Recovery email must be a different address you can still access if you lose this mailbox.",
        },
        { status: 400 },
      );
    }

    const captcha = await verifyCaptcha(captchaToken, request);
    if (!captcha.ok) {
      return NextResponse.json(
        { error: captcha.error || "Captcha verification failed" },
        { status: 400 },
      );
    }

    const result = await addPopMailbox(username, password);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to create mailbox" },
        { status: 502 },
      );
    }

    const createdEmail = (result.email || email).toLowerCase();

    try {
      await upsertAuthProfile(createdEmail, {
        recoveryEmail,
        totpEnabled: false,
        backupCodeHashes: [],
      });
    } catch (err) {
      console.error("Failed to save auth profile after signup", err);
    }

    const session = await getSession();
    session.isLoggedIn = true;
    session.email = createdEmail;
    session.password = password;
    await session.save();

    return NextResponse.json({
      ok: true,
      email: createdEmail,
      message: "Mailbox created successfully.",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Signup failed unexpectedly";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
