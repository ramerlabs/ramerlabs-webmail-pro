"use client";

import { Plus, Trash2, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WebmailShell } from "@/components/webmail-shell";
import { cn } from "@/lib/utils";

const CURRENCIES = [
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "PHP", label: "PHP — Philippine Peso" },
  { code: "JPY", label: "JPY — Japanese Yen" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
  { code: "SGD", label: "SGD — Singapore Dollar" },
  { code: "HKD", label: "HKD — Hong Kong Dollar" },
  { code: "CHF", label: "CHF — Swiss Franc" },
  { code: "CNY", label: "CNY — Chinese Yuan" },
  { code: "INR", label: "INR — Indian Rupee" },
  { code: "AED", label: "AED — UAE Dirham" },
  { code: "SAR", label: "SAR — Saudi Riyal" },
  { code: "NZD", label: "NZD — New Zealand Dollar" },
  { code: "KRW", label: "KRW — South Korean Won" },
  { code: "THB", label: "THB — Thai Baht" },
  { code: "MYR", label: "MYR — Malaysian Ringgit" },
  { code: "IDR", label: "IDR — Indonesian Rupiah" },
  { code: "VND", label: "VND — Vietnamese Dong" },
] as const;

const CURRENCY_CODES = new Set(CURRENCIES.map((c) => c.code));

function defaultCurrency(): string {
  if (typeof window === "undefined") return "USD";
  try {
    const saved = localStorage.getItem("webmail:expense-currency");
    if (saved && CURRENCY_CODES.has(saved as (typeof CURRENCIES)[number]["code"])) {
      return saved;
    }
  } catch {
    /* ignore */
  }
  return "USD";
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}
interface Category {
  id: string;
  name: string;
}

interface Expense {
  id: string;
  categoryId: string;
  amount: number;
  currency: string;
  date: string;
  description: string;
}

export function ExpensesPage({ email }: { email: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalsByCategory, setTotalsByCategory] = useState<
    Record<string, number>
  >({});
  const [activeCategoryId, setActiveCategoryId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [form, setForm] = useState({
    amount: "",
    currency: "USD",
    date: new Date().toISOString().slice(0, 10),
    description: "",
  });

  useEffect(() => {
    setForm((f) => ({ ...f, currency: defaultCurrency() }));
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/expenses", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load expenses");
        return;
      }
      const cats: Category[] = data.categories || [];
      setCategories(cats);
      setExpenses(data.expenses || []);
      setTotalsByCategory(data.totalsByCategory || {});
      setActiveCategoryId((prev) => {
        if (prev && cats.some((c) => c.id === prev)) return prev;
        return cats[0]?.id || "";
      });
    } catch {
      setError("Network error loading expenses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      activeCategoryId
        ? expenses.filter((e) => e.categoryId === activeCategoryId)
        : expenses,
    [expenses, activeCategoryId],
  );

  const activeCurrencyTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const expense of filtered) {
      map.set(
        expense.currency,
        (map.get(expense.currency) || 0) + expense.amount,
      );
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategory.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "category",
          action: "add",
          name: newCategory.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add category");
        return;
      }
      setNewCategory("");
      await load();
      if (data.category?.id) setActiveCategoryId(data.category.id);
    } catch {
      setError("Network error adding category");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCategory(id: string) {
    if (
      !window.confirm(
        "Delete this category? Expenses in it move to another category.",
      )
    ) {
      return;
    }
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "category", action: "delete", id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete category");
        return;
      }
      await load();
    } catch {
      setError("Network error deleting category");
    }
  }

  async function handleCreateExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCategoryId) {
      setError("Select or create a category first");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: activeCategoryId,
          amount: Number(form.amount),
          currency: form.currency,
          date: form.date,
          description: form.description,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add expense");
        return;
      }
      setForm((f) => ({
        ...f,
        amount: "",
        description: "",
        currency: form.currency,
      }));
      try {
        localStorage.setItem("webmail:expense-currency", form.currency);
      } catch {
        /* ignore */
      }
      await load();
    } catch {
      setError("Network error adding expense");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteExpense(id: string) {
    if (!window.confirm("Delete this expense?")) return;
    try {
      const res = await fetch(`/api/expenses?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete");
        return;
      }
      await load();
    } catch {
      setError("Network error deleting expense");
    }
  }

  return (
    <WebmailShell email={email} active="expenses">
      <section className="mail-reader mail-reader-full">
        <div className="border-b border-[var(--border)] px-6 py-5">
          <div className="flex items-center gap-3">
            <Wallet className="h-5 w-5 text-[var(--accent)]" />
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
                Expenses
              </h1>
              <p className="text-sm text-[var(--muted)]">
                Track spending by category — house, business, or your own
              </p>
            </div>
          </div>
        </div>

        <div className="mail-body-scroll flex-1 space-y-6 p-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Categories</p>
              <p className="text-xs text-[var(--muted)]">
                {activeCurrencyTotals.length === 0
                  ? "Active total: 0"
                  : activeCurrencyTotals.length === 1
                    ? `Active total: ${formatMoney(activeCurrencyTotals[0][1], activeCurrencyTotals[0][0])}`
                    : `Active totals: ${activeCurrencyTotals
                        .map(([code, sum]) => formatMoney(sum, code))
                        .join(" · ")}`}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveCategoryId(cat.id)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                      activeCategoryId === cat.id
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--foreground)]"
                        : "border-[var(--border)] text-[var(--muted-strong)] hover:bg-[var(--surface-muted)]",
                    )}
                  >
                    {cat.name}
                    <span className="ml-1.5 text-xs text-[var(--muted)]">
                      {(totalsByCategory[cat.id] || 0).toLocaleString(
                        undefined,
                        { maximumFractionDigits: 0 },
                      )}
                    </span>
                  </button>
                  {categories.length > 1 && (
                    <button
                      type="button"
                      className="icon-btn text-red-600"
                      title={`Delete ${cat.name}`}
                      onClick={() => void handleDeleteCategory(cat.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <form
              onSubmit={handleAddCategory}
              className="mt-4 flex flex-col gap-2 sm:flex-row"
            >
              <input
                className="field-input flex-1"
                placeholder="Add category (e.g. Travel, Trading tools)"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                maxLength={80}
              />
              <button
                type="submit"
                disabled={saving || !newCategory.trim()}
                className="btn-secondary gap-2 sm:w-fit"
              >
                <Plus className="h-4 w-4" />
                Add category
              </button>
            </form>
          </div>

          <form
            onSubmit={handleCreateExpense}
            className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <p className="text-sm font-medium sm:col-span-2 lg:col-span-4">
              Add expense
              {activeCategoryId
                ? ` · ${categories.find((c) => c.id === activeCategoryId)?.name || ""}`
                : ""}
            </p>
            <div>
              <label className="field-label">Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                className="field-input mt-1.5"
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="field-label" htmlFor="expense-currency">
                Currency
              </label>
              <select
                id="expense-currency"
                className="field-input mt-1.5"
                value={form.currency}
                onChange={(e) => {
                  const currency = e.target.value;
                  setForm((f) => ({ ...f, currency }));
                  try {
                    localStorage.setItem("webmail:expense-currency", currency);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
                {!CURRENCY_CODES.has(
                  form.currency as (typeof CURRENCIES)[number]["code"],
                ) &&
                  form.currency && (
                    <option value={form.currency}>{form.currency}</option>
                  )}
              </select>
            </div>
            <div>
              <label className="field-label">Date</label>
              <input
                type="date"
                required
                className="field-input mt-1.5"
                value={form.date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="field-label">Description</label>
              <input
                className="field-input mt-1.5"
                required
                placeholder="What did you spend on?"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <button
              type="submit"
              disabled={saving || !activeCategoryId}
              className="btn-primary gap-2 sm:col-span-2 sm:w-fit lg:col-span-4"
            >
              <Plus className="h-4 w-4" />
              {saving ? "Saving…" : "Add expense"}
            </button>
          </form>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading expenses…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No expenses in this category yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              {filtered.map((expense) => (
                <li
                  key={expense.id}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{expense.description}</p>
                    <p className="text-sm text-[var(--muted)]">
                      {expense.date}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold tabular-nums">
                      {formatMoney(expense.amount, expense.currency)}
                    </p>
                    <button
                      type="button"
                      className="icon-btn text-red-600"
                      onClick={() => void handleDeleteExpense(expense.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </WebmailShell>
  );
}
