"use client";

import { Plus, Trash2, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExpenseBarChart,
  ExpenseDonutChart,
  ExpenseMonthChart,
} from "@/components/expenses/expense-charts";
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

interface Subcategory {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  subcategories: Subcategory[];
}

interface Expense {
  id: string;
  categoryId: string;
  subcategoryId: string | null;
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
  const [totalsBySubcategory, setTotalsBySubcategory] = useState<
    Record<string, number>
  >({});
  const [activeCategoryId, setActiveCategoryId] = useState<string>("");
  const [activeSubcategoryId, setActiveSubcategoryId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newSubcategory, setNewSubcategory] = useState("");
  const [form, setForm] = useState({
    amount: "",
    currency: "USD",
    date: new Date().toISOString().slice(0, 10),
    description: "",
    subcategoryId: "",
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
      const cats: Category[] = (data.categories || []).map(
        (c: Category & { subcategories?: Subcategory[] }) => ({
          ...c,
          subcategories: Array.isArray(c.subcategories) ? c.subcategories : [],
        }),
      );
      setCategories(cats);
      setExpenses(data.expenses || []);
      setTotalsByCategory(data.totalsByCategory || {});
      setTotalsBySubcategory(data.totalsBySubcategory || {});
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

  const activeCategory = useMemo(
    () => categories.find((c) => c.id === activeCategoryId) || null,
    [categories, activeCategoryId],
  );

  useEffect(() => {
    if (!activeCategory) {
      setActiveSubcategoryId("");
      setForm((f) => ({ ...f, subcategoryId: "" }));
      return;
    }
    setActiveSubcategoryId((prev) => {
      if (prev && activeCategory.subcategories.some((s) => s.id === prev)) {
        return prev;
      }
      return "";
    });
    setForm((f) => {
      if (
        f.subcategoryId &&
        activeCategory.subcategories.some((s) => s.id === f.subcategoryId)
      ) {
        return f;
      }
      return { ...f, subcategoryId: "" };
    });
  }, [activeCategory]);

  const filtered = useMemo(() => {
    let list = expenses;
    if (activeCategoryId) {
      list = list.filter((e) => e.categoryId === activeCategoryId);
    }
    if (activeSubcategoryId) {
      list = list.filter((e) => e.subcategoryId === activeSubcategoryId);
    }
    return list;
  }, [expenses, activeCategoryId, activeSubcategoryId]);

  const chartCurrency = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of expenses) {
      counts.set(e.currency, (counts.get(e.currency) || 0) + 1);
    }
    let best = form.currency || "USD";
    let bestN = 0;
    for (const [code, n] of counts) {
      if (n > bestN) {
        best = code;
        bestN = n;
      }
    }
    return best;
  }, [expenses, form.currency]);

  const currencyExpenses = useMemo(
    () => expenses.filter((e) => e.currency === chartCurrency),
    [expenses, chartCurrency],
  );

  const categorySlices = useMemo(() => {
    return categories
      .map((cat) => ({
        id: cat.id,
        label: cat.name,
        value: currencyExpenses
          .filter((e) => e.categoryId === cat.id)
          .reduce((sum, e) => sum + e.amount, 0),
      }))
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [categories, currencyExpenses]);

  const subcategorySlices = useMemo(() => {
    if (!activeCategory) return [];
    const withSub = activeCategory.subcategories.map((sub) => ({
      id: sub.id,
      label: sub.name,
      value: currencyExpenses
        .filter(
          (e) =>
            e.categoryId === activeCategory.id && e.subcategoryId === sub.id,
        )
        .reduce((sum, e) => sum + e.amount, 0),
    }));
    const uncategorized = currencyExpenses
      .filter(
        (e) => e.categoryId === activeCategory.id && !e.subcategoryId,
      )
      .reduce((sum, e) => sum + e.amount, 0);
    const slices = withSub.filter((s) => s.value > 0);
    if (uncategorized > 0) {
      slices.push({
        id: "none",
        label: "No subcategory",
        value: uncategorized,
      });
    }
    return slices.sort((a, b) => b.value - a.value);
  }, [activeCategory, currencyExpenses]);

  const monthPoints = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of currencyExpenses) {
      const key = e.date.slice(0, 7);
      map.set(key, (map.get(key) || 0) + e.amount);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([key, value]) => ({
        key,
        label: key.slice(5),
        value,
      }));
  }, [currencyExpenses]);

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

  async function handleAddSubcategory(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCategoryId || !newSubcategory.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "subcategory",
          action: "add",
          categoryId: activeCategoryId,
          name: newSubcategory.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add subcategory");
        return;
      }
      setNewSubcategory("");
      await load();
      if (data.subcategory?.id) {
        setActiveSubcategoryId(data.subcategory.id);
        setForm((f) => ({ ...f, subcategoryId: data.subcategory.id }));
      }
    } catch {
      setError("Network error adding subcategory");
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

  async function handleDeleteSubcategory(id: string) {
    if (!activeCategoryId) return;
    if (
      !window.confirm(
        "Delete this subcategory? Expenses keep the parent category.",
      )
    ) {
      return;
    }
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "subcategory",
          action: "delete",
          categoryId: activeCategoryId,
          id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete subcategory");
        return;
      }
      if (activeSubcategoryId === id) setActiveSubcategoryId("");
      await load();
    } catch {
      setError("Network error deleting subcategory");
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
          subcategoryId: form.subcategoryId || null,
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
        subcategoryId: form.subcategoryId,
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

  function subcategoryName(expense: Expense): string | null {
    if (!expense.subcategoryId) return null;
    const cat = categories.find((c) => c.id === expense.categoryId);
    return (
      cat?.subcategories.find((s) => s.id === expense.subcategoryId)?.name ||
      null
    );
  }

  return (
    <WebmailShell email={email} active="expenses">
      <section className="mail-reader mail-reader-full">
        <div className="border-b border-[var(--border)] px-6 py-5">
          <div className="flex items-center gap-3">
            <Wallet className="h-5 w-5 text-[var(--accent)]" />
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
                Expense Tracker
              </h1>
              <p className="text-sm text-[var(--muted)]">
                Categories, subcategories, and charts for house, business, or
                your own budgets
              </p>
            </div>
          </div>
        </div>

        <div className="mail-body-scroll flex-1 space-y-6 p-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <ExpenseDonutChart
              title={`By category (${chartCurrency})`}
              slices={categorySlices}
              currency={chartCurrency}
              emptyLabel="Add expenses to see category charts"
            />
            <ExpenseBarChart
              title={
                activeCategory
                  ? `Subcategories · ${activeCategory.name}`
                  : "Subcategories"
              }
              slices={subcategorySlices}
              currency={chartCurrency}
              emptyLabel="Pick a category and add subcategory spending"
            />
            <ExpenseMonthChart
              title={`Last months (${chartCurrency})`}
              points={monthPoints}
              currency={chartCurrency}
              emptyLabel="Monthly trend appears after you add expenses"
            />
          </div>

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
                    onClick={() => {
                      setActiveCategoryId(cat.id);
                      setActiveSubcategoryId("");
                    }}
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

          {activeCategory && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="mb-3 text-sm font-medium">
                Subcategories · {activeCategory.name}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveSubcategoryId("")}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    !activeSubcategoryId
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border)] text-[var(--muted-strong)] hover:bg-[var(--surface-muted)]",
                  )}
                >
                  All
                </button>
                {activeCategory.subcategories.map((sub) => (
                  <div key={sub.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSubcategoryId(sub.id);
                        setForm((f) => ({ ...f, subcategoryId: sub.id }));
                      }}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                        activeSubcategoryId === sub.id
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-[var(--border)] text-[var(--muted-strong)] hover:bg-[var(--surface-muted)]",
                      )}
                    >
                      {sub.name}
                      <span className="ml-1.5 text-xs text-[var(--muted)]">
                        {(totalsBySubcategory[sub.id] || 0).toLocaleString(
                          undefined,
                          { maximumFractionDigits: 0 },
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn text-red-600"
                      title={`Delete ${sub.name}`}
                      onClick={() => void handleDeleteSubcategory(sub.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <form
                onSubmit={handleAddSubcategory}
                className="mt-4 flex flex-col gap-2 sm:flex-row"
              >
                <input
                  className="field-input flex-1"
                  placeholder="Add subcategory (e.g. Utilities, Software)"
                  value={newSubcategory}
                  onChange={(e) => setNewSubcategory(e.target.value)}
                  maxLength={80}
                />
                <button
                  type="submit"
                  disabled={saving || !newSubcategory.trim()}
                  className="btn-secondary gap-2 sm:w-fit"
                >
                  <Plus className="h-4 w-4" />
                  Add subcategory
                </button>
              </form>
            </div>
          )}

          <form
            onSubmit={handleCreateExpense}
            className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <p className="text-sm font-medium sm:col-span-2 lg:col-span-3">
              Add expense
              {activeCategory ? ` · ${activeCategory.name}` : ""}
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
              <label className="field-label" htmlFor="expense-subcategory">
                Subcategory
              </label>
              <select
                id="expense-subcategory"
                className="field-input mt-1.5"
                value={form.subcategoryId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, subcategoryId: e.target.value }))
                }
              >
                <option value="">None</option>
                {(activeCategory?.subcategories || []).map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
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
              className="btn-primary gap-2 sm:col-span-2 sm:w-fit lg:col-span-3"
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
              No expenses in this view yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              {filtered.map((expense) => {
                const subName = subcategoryName(expense);
                return (
                  <li
                    key={expense.id}
                    className="flex items-start justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{expense.description}</p>
                      <p className="text-sm text-[var(--muted)]">
                        {expense.date}
                        {subName ? ` · ${subName}` : ""}
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
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </WebmailShell>
  );
}
