import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";
import { normalizeEmail } from "@/lib/auth-crypto";

export type TodoPriority = "low" | "medium" | "high";

export interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  priority: TodoPriority;
  createdAt: string;
  updatedAt: string;
}

const PRIORITY_RANK: Record<TodoPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function todosKey(email: string): string {
  return `webmail:todos:${normalizeEmail(email)}`;
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function localStorePath(): string {
  return path.join(process.cwd(), ".data", "todos.json");
}

function normalizePriority(value: unknown): TodoPriority {
  if (value === "low" || value === "high" || value === "medium") return value;
  return "medium";
}

function normalizeTodo(todo: TodoItem): TodoItem {
  return {
    ...todo,
    priority: normalizePriority(todo.priority),
  };
}

async function readLocalStore(): Promise<Record<string, TodoItem[]>> {
  try {
    const raw = await readFile(localStorePath(), "utf8");
    return JSON.parse(raw) as Record<string, TodoItem[]>;
  } catch {
    return {};
  }
}

async function writeLocalStore(
  data: Record<string, TodoItem[]>,
): Promise<void> {
  const file = localStorePath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

async function getTodos(email: string): Promise<TodoItem[]> {
  const key = todosKey(email);
  const redis = getRedis();
  if (redis) {
    const value = await redis.get<TodoItem[]>(key);
    return Array.isArray(value) ? value.map(normalizeTodo) : [];
  }
  const store = await readLocalStore();
  return (store[normalizeEmail(email)] || []).map(normalizeTodo);
}

async function saveTodos(email: string, todos: TodoItem[]): Promise<TodoItem[]> {
  const normalized = normalizeEmail(email);
  const redis = getRedis();
  if (redis) {
    await redis.set(todosKey(normalized), todos);
    return todos;
  }
  if (process.env.VERCEL) {
    throw new Error(
      "Todos require Upstash Redis on Vercel. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    );
  }
  const store = await readLocalStore();
  store[normalized] = todos;
  await writeLocalStore(store);
  return todos;
}

export async function listTodos(email: string): Promise<TodoItem[]> {
  const todos = await getTodos(email);
  return [...todos].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export async function createTodo(
  email: string,
  input: { title: string; priority?: TodoPriority },
): Promise<TodoItem> {
  const now = new Date().toISOString();
  const item: TodoItem = {
    id: randomUUID(),
    title: input.title.trim(),
    completed: false,
    priority: normalizePriority(input.priority),
    createdAt: now,
    updatedAt: now,
  };
  const todos = await getTodos(email);
  todos.unshift(item);
  await saveTodos(email, todos);
  return item;
}

export async function updateTodo(
  email: string,
  id: string,
  patch: { title?: string; completed?: boolean; priority?: TodoPriority },
): Promise<TodoItem | null> {
  const todos = await getTodos(email);
  const idx = todos.findIndex((t) => t.id === id);
  if (idx < 0) return null;

  const current = todos[idx];
  const next: TodoItem = {
    ...current,
    title: patch.title !== undefined ? patch.title.trim() : current.title,
    completed:
      patch.completed !== undefined ? patch.completed : current.completed,
    priority:
      patch.priority !== undefined
        ? normalizePriority(patch.priority)
        : current.priority,
    updatedAt: new Date().toISOString(),
  };
  todos[idx] = next;
  await saveTodos(email, todos);
  return next;
}

export async function deleteTodo(
  email: string,
  id: string,
): Promise<boolean> {
  const todos = await getTodos(email);
  const next = todos.filter((t) => t.id !== id);
  if (next.length === todos.length) return false;
  await saveTodos(email, next);
  return true;
}

export async function deleteTodos(
  email: string,
  ids: string[],
): Promise<number> {
  if (!ids.length) return 0;
  const idSet = new Set(ids);
  const todos = await getTodos(email);
  const next = todos.filter((t) => !idSet.has(t.id));
  const removed = todos.length - next.length;
  if (removed > 0) await saveTodos(email, next);
  return removed;
}
