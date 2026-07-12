import { NextResponse } from "next/server";
import { licenseGuard } from "@/lib/license-guard";
import { z } from "zod";
import {
  addExpenseCategory,
  createExpense,
  deleteExpense,
  deleteExpenseCategory,
  getExpensesData,
  renameExpenseCategory,
  updateExpense,
} from "@/lib/expenses-store";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";

const createExpenseSchema = z.object({
  categoryId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().max(8).optional(),
  date: z.string().min(1),
  description: z.string().min(1).max(500),
});

const updateExpenseSchema = createExpenseSchema.partial().extend({
  id: z.string().uuid(),
});

const categorySchema = z.object({
  action: z.enum(["add", "rename", "delete"]),
  id: z.string().optional(),
  name: z.string().max(80).optional(),
});

export async function GET() {
  const licenseBlocked = await licenseGuard();
  if (licenseBlocked) return licenseBlocked;

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await getExpensesData(session.email);
    const totalsByCategory: Record<string, number> = {};
    for (const expense of data.expenses) {
      totalsByCategory[expense.categoryId] =
        (totalsByCategory[expense.categoryId] || 0) + expense.amount;
    }
    return NextResponse.json({
      ...data,
      totalsByCategory,
      total: data.expenses.reduce((sum, e) => sum + e.amount, 0),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load expenses";
    return NextResponse.json(
      { error: message, categories: [], expenses: [] },
      { status: 500 },
    );
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

    if (body?.type === "category") {
      const parsed = categorySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Invalid category" },
          { status: 400 },
        );
      }

      if (parsed.data.action === "add") {
        if (!parsed.data.name?.trim()) {
          return NextResponse.json(
            { error: "Category name is required" },
            { status: 400 },
          );
        }
        const category = await addExpenseCategory(
          session.email,
          parsed.data.name,
        );
        return NextResponse.json({ ok: true, category });
      }

      if (parsed.data.action === "rename") {
        if (!parsed.data.id || !parsed.data.name?.trim()) {
          return NextResponse.json(
            { error: "Category id and name are required" },
            { status: 400 },
          );
        }
        const category = await renameExpenseCategory(
          session.email,
          parsed.data.id,
          parsed.data.name,
        );
        if (!category) {
          return NextResponse.json(
            { error: "Category not found" },
            { status: 404 },
          );
        }
        return NextResponse.json({ ok: true, category });
      }

      if (!parsed.data.id) {
        return NextResponse.json(
          { error: "Category id is required" },
          { status: 400 },
        );
      }
      await deleteExpenseCategory(session.email, parsed.data.id);
      return NextResponse.json({ ok: true });
    }

    const parsed = createExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid expense" },
        { status: 400 },
      );
    }

    const expense = await createExpense(session.email, parsed.data);
    return NextResponse.json({ ok: true, expense });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save expense";
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
    const parsed = updateExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid update" },
        { status: 400 },
      );
    }
    const { id, ...patch } = parsed.data;
    const expense = await updateExpense(session.email, id, patch);
    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, expense });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update expense";
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
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing expense id" }, { status: 400 });
    }
    const ok = await deleteExpense(session.email, id);
    if (!ok) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete expense";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
