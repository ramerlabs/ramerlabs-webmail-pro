import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";
import { normalizeEmail } from "@/lib/auth-crypto";

export interface ExpenseSubcategory {
  id: string;
  name: string;
  createdAt: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  createdAt: string;
  subcategories: ExpenseSubcategory[];
}

export interface ExpenseItem {
  id: string;
  categoryId: string;
  subcategoryId: string | null;
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

function makeSub(name: string, createdAt: string): ExpenseSubcategory {
  return { id: randomUUID(), name, createdAt };
}

function defaultCategories(): ExpenseCategory[] {
  const now = new Date().toISOString();
  return [
    {
      id: "house",
      name: "House",
      createdAt: now,
      subcategories: [
        makeSub("Utilities", now),
        makeSub("Rent / Mortgage", now),
        makeSub("Groceries", now),
      ],
    },
    {
      id: "business",
      name: "Business",
      createdAt: now,
      subcategories: [
        makeSub("Software", now),
        makeSub("Marketing", now),
        makeSub("Operations", now),
      ],
    },
  ];
}

function emptyData(): ExpensesData {
  return { categories: defaultCategories(), expenses: [] };
}

function normalizeCategory(raw: Partial<ExpenseCategory> & { id: string; name: string }): ExpenseCategory {
  return {
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt || new Date().toISOString(),
    subcategories: Array.isArray(raw.subcategories)
      ? raw.subcategories.map((s) => ({
          id: s.id,
          name: s.name,
          createdAt: s.createdAt || new Date().toISOString(),
        }))
      : [],
  };
}

function normalizeExpense(raw: Partial<ExpenseItem> & {
  id: string;
  categoryId: string;
  amount: number;
  date: string;
  description: string;
}): ExpenseItem {
  return {
    id: raw.id,
    categoryId: raw.categoryId,
    subcategoryId: raw.subcategoryId || null,
    amount: Number(raw.amount) || 0,
    currency: (raw.currency || "USD").toUpperCase(),
    date: raw.date,
    description: raw.description || "",
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
  };
}

function normalizeData(value: Partial<ExpensesData> | null | undefined): ExpensesData {
  if (!value) return emptyData();
  const categories =
    Array.isArray(value.categories) && value.categories.length
      ? value.categories.map((c) =>
          normalizeCategory(c as ExpenseCategory),
        )
      : defaultCategories();
  const expenses = Array.isArray(value.expenses)
    ? value.expenses.map((e) => normalizeExpense(e as ExpenseItem))
    : [];
  return { categories, expenses };
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
    return normalizeData(value);
  }
  const store = await readLocalStore();
  return normalizeData(store[normalizeEmail(email)]);
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
    categories: [...data.categories]
      .map((c) => ({
        ...c,
        subcategories: [...c.subcategories].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
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
    subcategories: [],
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
    e.categoryId === id
      ? { ...e, categoryId: fallback, subcategoryId: null }
      : e,
  );
  await saveData(email, data);
  return true;
}

export async function addExpenseSubcategory(
  email: string,
  categoryId: string,
  name: string,
): Promise<ExpenseSubcategory> {
  const data = await getData(email);
  const cat = data.categories.find((c) => c.id === categoryId);
  if (!cat) throw new Error("Unknown category");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Subcategory name is required");
  if (
    cat.subcategories.some(
      (s) => s.name.toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    throw new Error("That subcategory already exists");
  }
  const sub: ExpenseSubcategory = {
    id: randomUUID(),
    name: trimmed,
    createdAt: new Date().toISOString(),
  };
  cat.subcategories.push(sub);
  await saveData(email, data);
  return sub;
}

export async function renameExpenseSubcategory(
  email: string,
  categoryId: string,
  id: string,
  name: string,
): Promise<ExpenseSubcategory | null> {
  const data = await getData(email);
  const cat = data.categories.find((c) => c.id === categoryId);
  if (!cat) return null;
  const idx = cat.subcategories.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Subcategory name is required");
  cat.subcategories[idx] = { ...cat.subcategories[idx], name: trimmed };
  await saveData(email, data);
  return cat.subcategories[idx];
}

export async function deleteExpenseSubcategory(
  email: string,
  categoryId: string,
  id: string,
): Promise<boolean> {
  const data = await getData(email);
  const cat = data.categories.find((c) => c.id === categoryId);
  if (!cat) return false;
  if (!cat.subcategories.some((s) => s.id === id)) return false;
  cat.subcategories = cat.subcategories.filter((s) => s.id !== id);
  data.expenses = data.expenses.map((e) =>
    e.subcategoryId === id ? { ...e, subcategoryId: null } : e,
  );
  await saveData(email, data);
  return true;
}

export async function createExpense(
  email: string,
  input: {
    categoryId: string;
    subcategoryId?: string | null;
    amount: number;
    currency?: string;
    date: string;
    description: string;
  },
): Promise<ExpenseItem> {
  const data = await getData(email);
  const cat = data.categories.find((c) => c.id === input.categoryId);
  if (!cat) throw new Error("Unknown category");

  let subcategoryId: string | null = input.subcategoryId || null;
  if (subcategoryId && !cat.subcategories.some((s) => s.id === subcategoryId)) {
    throw new Error("Unknown subcategory");
  }

  const now = new Date().toISOString();
  const item: ExpenseItem = {
    id: randomUUID(),
    categoryId: input.categoryId,
    subcategoryId,
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
    Pick<
      ExpenseItem,
      | "categoryId"
      | "subcategoryId"
      | "amount"
      | "currency"
      | "date"
      | "description"
    >
  >,
): Promise<ExpenseItem | null> {
  const data = await getData(email);
  const idx = data.expenses.findIndex((e) => e.id === id);
  if (idx < 0) return null;

  const current = data.expenses[idx];
  const nextCategoryId = patch.categoryId || current.categoryId;
  const cat = data.categories.find((c) => c.id === nextCategoryId);
  if (!cat) throw new Error("Unknown category");

  let nextSubId =
    patch.subcategoryId !== undefined
      ? patch.subcategoryId
      : current.subcategoryId;
  if (patch.categoryId && patch.categoryId !== current.categoryId) {
    nextSubId = patch.subcategoryId !== undefined ? patch.subcategoryId : null;
  }
  if (nextSubId && !cat.subcategories.some((s) => s.id === nextSubId)) {
    throw new Error("Unknown subcategory");
  }

  const next: ExpenseItem = {
    ...current,
    ...patch,
    categoryId: nextCategoryId,
    subcategoryId: nextSubId,
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
