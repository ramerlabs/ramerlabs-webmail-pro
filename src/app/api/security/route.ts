import { NextResponse } from "next/server";
import { z } from "zod";
import { generateBackupCodes } from "@/lib/auth-crypto";
import {
  getAuthProfile,
  getTotpSecret,
  hashCodes,
  saveAuthProfile,
  setTotpSecret,
  upsertAuthProfile,
} from "@/lib/auth-store";
import { requireSession } from "@/lib/session";
import {
  generateTotpSecret,
  totpQrDataUrl,
  verifyTotpCode,
} from "@/lib/totp";

export const runtime = "nodejs";

const recoverySchema = z.object({
  recoveryEmail: z.string().email(),
});

const confirm2faSchema = z.object({
  code: z.string().min(6).max(12),
  secret: z.string().min(16),
});

const disable2faSchema = z.object({
  code: z.string().min(4).max(64),
});

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getAuthProfile(session.email);
  return NextResponse.json({
    recoveryEmail: profile?.recoveryEmail || "",
    totpEnabled: Boolean(profile?.totpEnabled),
    backupCodesRemaining: profile?.backupCodeHashes?.length || 0,
  });
}

export async function PUT(request: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const action = String(body.action || "");

  try {
    if (action === "updateRecoveryEmail") {
      const parsed = recoverySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Invalid email" },
          { status: 400 },
        );
      }
      if (
        parsed.data.recoveryEmail.toLowerCase() ===
        session.email.toLowerCase()
      ) {
        return NextResponse.json(
          { error: "Recovery email must be different from this mailbox." },
          { status: 400 },
        );
      }
      await upsertAuthProfile(session.email, {
        recoveryEmail: parsed.data.recoveryEmail,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "begin2fa") {
      const secret = generateTotpSecret();
      const { uri, qrDataUrl } = await totpQrDataUrl(secret, session.email);
      return NextResponse.json({ ok: true, secret, uri, qrDataUrl });
    }

    if (action === "confirm2fa") {
      const parsed = confirm2faSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Enter the 6-digit code from your authenticator app." },
          { status: 400 },
        );
      }
      if (!verifyTotpCode(parsed.data.secret, parsed.data.code)) {
        return NextResponse.json(
          { error: "That code is invalid. Try again." },
          { status: 400 },
        );
      }
      const codes = generateBackupCodes(8);
      const existing = await getAuthProfile(session.email);
      await saveAuthProfile({
        email: session.email,
        recoveryEmail: existing?.recoveryEmail || "",
        totpEnabled: true,
        totpSecretEnc: setTotpSecret(parsed.data.secret),
        backupCodeHashes: hashCodes(codes),
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return NextResponse.json({
        ok: true,
        backupCodes: codes,
        message: "Two-factor authentication is enabled.",
      });
    }

    if (action === "disable2fa") {
      const parsed = disable2faSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Enter a valid authenticator or backup code." },
          { status: 400 },
        );
      }
      const profile = await getAuthProfile(session.email);
      if (!profile?.totpEnabled) {
        return NextResponse.json({ ok: true });
      }
      const secret = getTotpSecret(profile);
      const totpOk = secret
        ? verifyTotpCode(secret, parsed.data.code)
        : false;
      let backupOk = false;
      if (!totpOk) {
        const { consumeBackupCode } = await import("@/lib/auth-store");
        backupOk = await consumeBackupCode(session.email, parsed.data.code);
      }
      if (!totpOk && !backupOk) {
        return NextResponse.json(
          { error: "Invalid authentication or backup code." },
          { status: 401 },
        );
      }
      await saveAuthProfile({
        ...profile,
        totpEnabled: false,
        totpSecretEnc: undefined,
        backupCodeHashes: [],
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "regenerateBackupCodes") {
      const profile = await getAuthProfile(session.email);
      if (!profile?.totpEnabled) {
        return NextResponse.json(
          { error: "Enable 2FA before generating backup codes." },
          { status: 400 },
        );
      }
      const code = String(body.code || "");
      const secret = getTotpSecret(profile);
      if (!secret || !verifyTotpCode(secret, code)) {
        return NextResponse.json(
          { error: "Enter a valid authenticator code to regenerate codes." },
          { status: 401 },
        );
      }
      const codes = generateBackupCodes(8);
      await saveAuthProfile({
        ...profile,
        backupCodeHashes: hashCodes(codes),
      });
      return NextResponse.json({ ok: true, backupCodes: codes });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Security update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
