import { NextResponse } from "next/server";
import { hashToken, signPayload } from "@/lib/auth-crypto";
import {
  findAuthProfileForReset,
  markResetEmailSent,
  wasResetEmailRecentlySent,
} from "@/lib/auth-store";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { appBaseUrl, sendSystemMail } from "@/lib/system-mail";
import { forgotPasswordSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limited = rateLimit({
      key: `forgot:${ip}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${limited.retryAfterSec}s.` },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec) },
        },
      );
    }

    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    const identifier = parsed.data.email.toLowerCase();
    // Always return the same message to avoid account enumeration
    const generic = {
      ok: true,
      message:
        "If that address matches a mailbox with a recovery email on file, we sent a reset link.",
    };

    const profile = await findAuthProfileForReset(identifier);
    if (!profile?.recoveryEmail || !profile.email) {
      return NextResponse.json(generic);
    }

    const mailbox = profile.email.toLowerCase();

    // One reset email per mailbox within the cooldown window
    if (await wasResetEmailRecentlySent(mailbox)) {
      return NextResponse.json({
        ok: true,
        message:
          "A reset link was already sent recently. Check your recovery inbox (and spam). You can request another link in a few minutes.",
      });
    }

    // Also rate-limit by destination recovery address
    const recoveryLimited = rateLimit({
      key: `forgot-to:${profile.recoveryEmail.toLowerCase()}`,
      limit: 2,
      windowMs: 15 * 60 * 1000,
    });
    if (!recoveryLimited.ok) {
      return NextResponse.json({
        ok: true,
        message:
          "A reset link was already sent recently. Check your recovery inbox (and spam).",
      });
    }

    const token = signPayload(
      {
        type: "reset",
        email: mailbox,
        recovery: profile.recoveryEmail,
        jti: hashToken(`${mailbox}:${Date.now()}`),
      },
      30 * 60,
    );

    const resetUrl = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    const sent = await sendSystemMail({
      to: profile.recoveryEmail,
      subject: "Reset your RamerLabs Webmail password",
      text: [
        `We received a password reset request for ${mailbox}.`,
        "",
        `Open this link to choose a new password (expires in 30 minutes):`,
        resetUrl,
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
      html: `
        <p>We received a password reset request for <strong>${mailbox}</strong>.</p>
        <p><a href="${resetUrl}">Choose a new password</a> (expires in 30 minutes).</p>
        <p>If you did not request this, you can ignore this email.</p>
      `,
    });

    if (!sent.ok) {
      console.error("[forgot-password] send failed:", sent.error);
      return NextResponse.json(
        { error: sent.error || "Failed to send recovery email" },
        { status: 502 },
      );
    }

    await markResetEmailSent(mailbox);

    return NextResponse.json(generic);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
