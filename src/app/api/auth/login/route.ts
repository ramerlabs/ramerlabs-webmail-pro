import { NextResponse } from "next/server";
import { ensureDefaultAppAdmin, verifyAppAdmin } from "@/lib/app-admin";
import { encryptSecret, signPayload } from "@/lib/auth-crypto";
import { getAuthProfile } from "@/lib/auth-store";
import { verifyImapCredentials } from "@/lib/imap";
import { getSession } from "@/lib/session";
import { loginSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    const { email, password } = parsed.data;

    // Installer admin: admin@{MAIL_DOMAIN} / admin123 (no IMAP mailbox required)
    await ensureDefaultAppAdmin();
    const appAdmin = await verifyAppAdmin(email, password);
    if (appAdmin) {
      const session = await getSession();
      session.isLoggedIn = true;
      session.isAppAdmin = true;
      session.email = appAdmin.username;
      session.password = "";
      await session.save();
      return NextResponse.json({
        ok: true,
        email: appAdmin.username,
        isAppAdmin: true,
        requires2fa: false,
      });
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

    const verify = await verifyImapCredentials(email, password);

    if (!verify.ok) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    const profile = await getAuthProfile(email);
    if (profile?.totpEnabled) {
      const pendingToken = signPayload(
        {
          type: "2fa",
          email: email.toLowerCase(),
          passwordEnc: encryptSecret(password),
        },
        5 * 60,
      );
      return NextResponse.json({
        ok: true,
        requires2fa: true,
        pendingToken,
        email,
      });
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
      isAppAdmin: false,
      requires2fa: false,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Login failed unexpectedly";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
