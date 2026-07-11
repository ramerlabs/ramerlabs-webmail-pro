import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";
import { normalizeEmail } from "@/lib/auth-crypto";

export interface NoteItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

function notesKey(email: string): string {
  return `webmail:notes:${normalizeEmail(email)}`;
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function localStorePath(): string {
  return path.join(process.cwd(), ".data", "notes.json");
}

async function readLocalStore(): Promise<Record<string, NoteItem[]>> {
  try {
    const raw = await readFile(localStorePath(), "utf8");
    return JSON.parse(raw) as Record<string, NoteItem[]>;
  } catch {
    return {};
  }
}

async function writeLocalStore(
  data: Record<string, NoteItem[]>,
): Promise<void> {
  const file = localStorePath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

async function getNotes(email: string): Promise<NoteItem[]> {
  const key = notesKey(email);
  const redis = getRedis();
  if (redis) {
    const value = await redis.get<NoteItem[]>(key);
    return Array.isArray(value) ? value : [];
  }
  const store = await readLocalStore();
  return store[normalizeEmail(email)] || [];
}

async function saveNotes(email: string, notes: NoteItem[]): Promise<NoteItem[]> {
  const normalized = normalizeEmail(email);
  const redis = getRedis();
  if (redis) {
    await redis.set(notesKey(normalized), notes);
    return notes;
  }
  if (process.env.VERCEL) {
    throw new Error(
      "Notes require Upstash Redis on Vercel. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    );
  }
  const store = await readLocalStore();
  store[normalized] = notes;
  await writeLocalStore(store);
  return notes;
}

export async function listNotes(email: string): Promise<NoteItem[]> {
  const notes = await getNotes(email);
  return [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createNote(
  email: string,
  input: { title: string; body?: string },
): Promise<NoteItem> {
  const now = new Date().toISOString();
  const item: NoteItem = {
    id: randomUUID(),
    title: input.title.trim() || "Untitled",
    body: (input.body || "").trim(),
    createdAt: now,
    updatedAt: now,
  };
  const notes = await getNotes(email);
  notes.unshift(item);
  await saveNotes(email, notes);
  return item;
}

export async function updateNote(
  email: string,
  id: string,
  patch: { title?: string; body?: string },
): Promise<NoteItem | null> {
  const notes = await getNotes(email);
  const idx = notes.findIndex((n) => n.id === id);
  if (idx < 0) return null;

  const current = notes[idx];
  const next: NoteItem = {
    ...current,
    title:
      patch.title !== undefined
        ? patch.title.trim() || "Untitled"
        : current.title,
    body: patch.body !== undefined ? patch.body : current.body,
    updatedAt: new Date().toISOString(),
  };
  notes[idx] = next;
  await saveNotes(email, notes);
  return next;
}

export async function deleteNote(
  email: string,
  id: string,
): Promise<boolean> {
  const notes = await getNotes(email);
  const next = notes.filter((n) => n.id !== id);
  if (next.length === notes.length) return false;
  await saveNotes(email, next);
  return true;
}
