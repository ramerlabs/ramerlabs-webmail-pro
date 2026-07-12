import { NextResponse } from "next/server";
import { decryptSecret, verifySignedPayload } from "@/lib/auth-crypto";
import {
  consumeBackupCode,
  getAuthProfile,
  getTotpSecret,
} from "@/lib/auth-store";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { verifyTotpCode } from "@/lib/totp";
import { login2faSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limited = rateLimit({
      key: `login2fa:${ip}`,
      limit: 12,
      windowMs: 15 * 60 * 1000,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${limited.retryAfterSec}s.` },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec) },
        },
      );
    }

    const body = await request.json();
    const parsed = login2faSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    const pending = verifySignedPayload<{
      type: string;
      email: string;
      passwordEnc?: string;
      password?: string;
    }>(parsed.data.pendingToken);

    if (!pending || pending.type !== "2fa" || !pending.email) {
      return NextResponse.json(
        { error: "Login challenge expired. Sign in again." },
        { status: 401 },
      );
    }

    const email = String(pending.email || "").toLowerCase();
    if (!email) {
      return NextResponse.json(
        { error: "Login challenge expired. Sign in again." },
        { status: 401 },
      );
    }

    const { isEmailBlocked, BLOCKED_EMAIL_MESSAGE } = await import(
      "@/lib/admin-settings"
    );
    if (await isEmailBlocked(email)) {
      return NextResponse.json(
        { error: BLOCKED_EMAIL_MESSAGE },
        { status: 403 },
      );
    }

    let password = "";
    try {
      password = pending.passwordEnc
        ? decryptSecret(pending.passwordEnc)
        : pending.password || "";
    } catch {
      password = "";
    }
    if (!password) {
      return NextResponse.json(
        { error: "Login challenge expired. Sign in again." },
        { status: 401 },
      );
    }

    const profile = await getAuthProfile(email);
    if (!profile?.totpEnabled) {
      return NextResponse.json(
        { error: "Two-factor authentication is not enabled." },
        { status: 400 },
      );
    }

    const code = parsed.data.code.trim();
    const secret = getTotpSecret(profile);
    const totpOk = secret ? verifyTotpCode(secret, code) : false;
    const backupOk = totpOk
      ? false
      : await consumeBackupCode(email, code);

    if (!totpOk && !backupOk) {
      return NextResponse.json(
        { error: "Invalid authentication or backup code." },
        { status: 401 },
      );
    }

    const session = await getSession();
    session.isLoggedIn = true;
    session.isAppAdmin = false;
    session.email = email;
    session.password = password;
    await session.save();

    return NextResponse.json({
      ok: true,
      email,
      usedBackupCode: backupOk,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
