import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";
import { normalizeEmail } from "@/lib/auth-crypto";

export interface ExpenseCategory {
  id: string;
  name: string;
  createdAt: string;
}

export interface ExpenseItem {
  id: string;
  categoryId: string;
  amount: number;
  currency: string;
  date: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpensesData {
  categories: ExpenseCategory[];
  expenses: ExpenseItem[];
}

function storeKey(email: string): string {
  return `webmail:expenses:${normalizeEmail(email)}`;
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function localStorePath(): string {
  return path.join(process.cwd(), ".data", "expenses.json");
}

function defaultCategories(): ExpenseCategory[] {
  const now = new Date().toISOString();
  return [
    { id: "house", name: "House", createdAt: now },
    { id: "business", name: "Business", createdAt: now },
  ];
}

function emptyData(): ExpensesData {
  return { categories: defaultCategories(), expenses: [] };
}

async function readLocalStore(): Promise<Record<string, ExpensesData>> {
  try {
    const raw = await readFile(localStorePath(), "utf8");
    return JSON.parse(raw) as Record<string, ExpensesData>;
  } catch {
    return {};
  }
}

async function writeLocalStore(
  data: Record<string, ExpensesData>,
): Promise<void> {
  const file = localStorePath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

async function getData(email: string): Promise<ExpensesData> {
  const redis = getRedis();
  if (redis) {
    const value = await redis.get<ExpensesData>(storeKey(email));
    if (!value) return emptyData();
    return {
      categories:
        Array.isArray(value.categories) && value.categories.length
          ? value.categories
          : defaultCategories(),
      expenses: Array.isArray(value.expenses) ? value.expenses : [],
    };
  }
  const store = await readLocalStore();
  return store[normalizeEmail(email)] || emptyData();
}

async function saveData(
  email: string,
  data: ExpensesData,
): Promise<ExpensesData> {
  const normalized = normalizeEmail(email);
  const redis = getRedis();
  if (redis) {
    await redis.set(storeKey(normalized), data);
    return data;
  }
  if (process.env.VERCEL) {
    throw new Error(
      "Expenses require Upstash Redis on Vercel. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    );
  }
  const store = await readLocalStore();
  store[normalized] = data;
  await writeLocalStore(store);
  return data;
}

export async function getExpensesData(email: string): Promise<ExpensesData> {
  const data = await getData(email);
  return {
    categories: [...data.categories].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    expenses: [...data.expenses].sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export async function addExpenseCategory(
  email: string,
  name: string,
): Promise<ExpenseCategory> {
  const data = await getData(email);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required");
  const exists = data.categories.some(
    (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exists) throw new Error("That category already exists");

  const category: ExpenseCategory = {
    id: randomUUID(),
    name: trimmed,
    createdAt: new Date().toISOString(),
  };
  data.categories.push(category);
  await saveData(email, data);
  return category;
}

export async function renameExpenseCategory(
  email: string,
  id: string,
  name: string,
): Promise<ExpenseCategory | null> {
  const data = await getData(email);
  const idx = data.categories.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required");
  data.categories[idx] = { ...data.categories[idx], name: trimmed };
  await saveData(email, data);
  return data.categories[idx];
}

export async function deleteExpenseCategory(
  email: string,
  id: string,
): Promise<boolean> {
  const data = await getData(email);
  if (data.categories.length <= 1) {
    throw new Error("Keep at least one category");
  }
  if (!data.categories.some((c) => c.id === id)) return false;

  const remaining = data.categories.filter((c) => c.id !== id);
  const fallback = remaining[0].id;
  data.categories = remaining;
  data.expenses = data.expenses.map((e) =>
    e.categoryId === id ? { ...e, categoryId: fallback } : e,
  );
  await saveData(email, data);
  return true;
}

export async function createExpense(
  email: string,
  input: {
    categoryId: string;
    amount: number;
    currency?: string;
    date: string;
    description: string;
  },
): Promise<ExpenseItem> {
  const data = await getData(email);
  if (!data.categories.some((c) => c.id === input.categoryId)) {
    throw new Error("Unknown category");
  }
  const now = new Date().toISOString();
  const item: ExpenseItem = {
    id: randomUUID(),
    categoryId: input.categoryId,
    amount: Number(input.amount),
    currency: (input.currency || "USD").trim().toUpperCase() || "USD",
    date: input.date,
    description: input.description.trim(),
    createdAt: now,
    updatedAt: now,
  };
  data.expenses.unshift(item);
  await saveData(email, data);
  return item;
}

export async function updateExpense(
  email: string,
  id: string,
  patch: Partial<
    Pick<ExpenseItem, "categoryId" | "amount" | "currency" | "date" | "description">
  >,
): Promise<ExpenseItem | null> {
  const data = await getData(email);
  const idx = data.expenses.findIndex((e) => e.id === id);
  if (idx < 0) return null;

  if (
    patch.categoryId &&
    !data.categories.some((c) => c.id === patch.categoryId)
  ) {
    throw new Error("Unknown category");
  }

  const current = data.expenses[idx];
  const next: ExpenseItem = {
    ...current,
    ...patch,
    currency:
      patch.currency !== undefined
        ? patch.currency.trim().toUpperCase() || current.currency
        : current.currency,
    description:
      patch.description !== undefined
        ? patch.description.trim()
        : current.description,
    amount:
      patch.amount !== undefined ? Number(patch.amount) : current.amount,
    updatedAt: new Date().toISOString(),
  };
  data.expenses[idx] = next;
  await saveData(email, data);
  return next;
}

export async function deleteExpense(
  email: string,
  id: string,
): Promise<boolean> {
  const data = await getData(email);
  const next = data.expenses.filter((e) => e.id !== id);
  if (next.length === data.expenses.length) return false;
  data.expenses = next;
  await saveData(email, data);
  return true;
}
