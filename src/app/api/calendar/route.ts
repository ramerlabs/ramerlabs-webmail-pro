import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
} from "@/lib/calendar-store";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";

const createSchema = z.object({
  summary: z.string().min(1).max(300),
  description: z.string().max(4000).optional(),
  location: z.string().max(300).optional(),
  start: z.string().min(1),
  end: z.string().min(1),
  allDay: z.boolean().optional(),
});

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const events = await listCalendarEvents(session.email);
    return NextResponse.json({ events });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load calendar";
    return NextResponse.json({ error: message, events: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid event" },
        { status: 400 },
      );
    }

    const event = await createCalendarEvent(session.email, parsed.data);
    return NextResponse.json({ ok: true, event });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing event id" }, { status: 400 });
    }

    const ok = await deleteCalendarEvent(session.email, id);
    if (!ok) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
