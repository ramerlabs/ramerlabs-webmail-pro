import { NextResponse } from "next/server";
import { licenseGuard } from "@/lib/license-guard";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import {
  createTodo,
  deleteTodo,
  deleteTodos,
  listTodos,
  updateTodo,
} from "@/lib/todos-store";

export const runtime = "nodejs";

const prioritySchema = z.enum(["low", "medium", "high"]);

const createSchema = z.object({
  title: z.string().min(1).max(500),
  priority: prioritySchema.optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  completed: z.boolean().optional(),
  priority: prioritySchema.optional(),
});

const massDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

export async function GET() {
  const licenseBlocked = await licenseGuard();
  if (licenseBlocked) return licenseBlocked;

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const todos = await listTodos(session.email);
    return NextResponse.json({ todos });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load todos";
    return NextResponse.json({ error: message, todos: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const licenseBlocked = await licenseGuard();
  if (licenseBlocked) return licenseBlocked;

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid todo" },
        { status: 400 },
      );
    }

    const todo = await createTodo(session.email, parsed.data);
    return NextResponse.json({ ok: true, todo });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create todo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const licenseBlocked = await licenseGuard();
  if (licenseBlocked) return licenseBlocked;

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
    if (
      patch.title === undefined &&
      patch.completed === undefined &&
      patch.priority === undefined
    ) {
      return NextResponse.json(
        { error: "Provide title, completed, and/or priority" },
        { status: 400 },
      );
    }

    const todo = await updateTodo(session.email, id, patch);
    if (!todo) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, todo });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update todo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const licenseBlocked = await licenseGuard();
  if (licenseBlocked) return licenseBlocked;

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const parsed = massDeleteSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Invalid delete request" },
          { status: 400 },
        );
      }
      const deleted = await deleteTodos(session.email, parsed.data.ids);
      return NextResponse.json({ ok: true, deleted });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing todo id" }, { status: 400 });
    }

    const ok = await deleteTodo(session.email, id);
    if (!ok) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete todo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
