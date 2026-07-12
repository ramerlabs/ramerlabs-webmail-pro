import { NextResponse } from "next/server";
import { licenseGuard } from "@/lib/license-guard";
import { z } from "zod";
import {
  defaultSettings,
  getSettings,
  requireSession,
  type ReplyBehavior,
} from "@/lib/session";

export const runtime = "nodejs";

const settingsSchema = z.object({
  displayName: z.string().max(120).optional(),
  signature: z.string().max(4000).optional(),
  replyBehavior: z.enum(["reply", "replyAll"]).optional(),
  threadedView: z.boolean().optional(),
});

export async function GET() {
  const licenseBlocked = await licenseGuard();
  if (licenseBlocked) return licenseBlocked;

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ settings: getSettings(session) });
}

export async function PUT(request: Request) {
  const licenseBlocked = await licenseGuard();
  if (licenseBlocked) return licenseBlocked;

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid settings" },
        { status: 400 },
      );
    }

    const current = getSettings(session);
    const next = {
      displayName:
        parsed.data.displayName !== undefined
          ? parsed.data.displayName.trim()
          : current.displayName,
      signature:
        parsed.data.signature !== undefined
          ? parsed.data.signature
          : current.signature,
      replyBehavior: (parsed.data.replyBehavior ||
        current.replyBehavior) as ReplyBehavior,
      threadedView:
        parsed.data.threadedView !== undefined
          ? parsed.data.threadedView
          : current.threadedView,
    };

    session.settings = { ...defaultSettings, ...next };
    await session.save();

    return NextResponse.json({ ok: true, settings: session.settings });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
