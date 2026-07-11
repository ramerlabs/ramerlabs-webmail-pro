import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createNote,
  deleteNote,
  listNotes,
  updateNote,
} from "@/lib/notes-store";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().max(200).optional(),
  body: z.string().max(20000).optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(200).optional(),
  body: z.string().max(20000).optional(),
});

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const notes = await listNotes(session.email);
    return NextResponse.json({ notes });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load notes";
    return NextResponse.json({ error: message, notes: [] }, { status: 500 });
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
        { error: parsed.error.issues[0]?.message || "Invalid note" },
        { status: 400 },
      );
    }

    const title = (parsed.data.title || "").trim();
    const noteBody = (parsed.data.body || "").trim();
    if (!title && !noteBody) {
      return NextResponse.json(
        { error: "Title or body is required" },
        { status: 400 },
      );
    }

    const note = await createNote(session.email, {
      title: title || "Untitled",
      body: noteBody,
    });
    return NextResponse.json({ ok: true, note });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create note";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid update" },
        { status: 400 },
      );
    }

    const { id, ...patch } = parsed.data;
    if (patch.title === undefined && patch.body === undefined) {
      return NextResponse.json(
        { error: "Provide title and/or body" },
        { status: 400 },
      );
    }

    const note = await updateNote(session.email, id, patch);
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, note });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update note";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing note id" }, { status: 400 });
    }

    const ok = await deleteNote(session.email, id);
    if (!ok) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete note";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
