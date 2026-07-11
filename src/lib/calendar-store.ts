import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";
import { normalizeEmail } from "@/lib/auth-crypto";

export interface CalendarEvent {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  createdAt: string;
  updatedAt: string;
}

function storeKey(email: string): string {
  return `webmail:calendar:${normalizeEmail(email)}`;
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function localStorePath(): string {
  return path.join(process.cwd(), ".data", "calendar.json");
}

async function readLocalStore(): Promise<Record<string, CalendarEvent[]>> {
  try {
    const raw = await readFile(localStorePath(), "utf8");
    return JSON.parse(raw) as Record<string, CalendarEvent[]>;
  } catch {
    return {};
  }
}

async function writeLocalStore(
  data: Record<string, CalendarEvent[]>,
): Promise<void> {
  const file = localStorePath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

async function getEvents(email: string): Promise<CalendarEvent[]> {
  const redis = getRedis();
  if (redis) {
    const value = await redis.get<CalendarEvent[]>(storeKey(email));
    return Array.isArray(value) ? value : [];
  }
  const store = await readLocalStore();
  return store[normalizeEmail(email)] || [];
}

async function saveEvents(
  email: string,
  events: CalendarEvent[],
): Promise<CalendarEvent[]> {
  const normalized = normalizeEmail(email);
  const redis = getRedis();
  if (redis) {
    await redis.set(storeKey(normalized), events);
    return events;
  }
  if (process.env.VERCEL) {
    throw new Error(
      "Calendar requires Upstash Redis on Vercel. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    );
  }
  const store = await readLocalStore();
  store[normalized] = events;
  await writeLocalStore(store);
  return events;
}

export async function listCalendarEvents(
  email: string,
): Promise<CalendarEvent[]> {
  const events = await getEvents(email);
  return [...events].sort((a, b) => a.start.localeCompare(b.start));
}

export async function createCalendarEvent(
  email: string,
  input: {
    summary: string;
    description?: string;
    location?: string;
    start: string;
    end: string;
    allDay?: boolean;
  },
): Promise<CalendarEvent> {
  const now = new Date().toISOString();
  const item: CalendarEvent = {
    id: randomUUID(),
    summary: input.summary.trim(),
    description: (input.description || "").trim(),
    location: (input.location || "").trim(),
    start: input.start,
    end: input.end || input.start,
    allDay: Boolean(input.allDay),
    createdAt: now,
    updatedAt: now,
  };
  const events = await getEvents(email);
  events.unshift(item);
  await saveEvents(email, events);
  return item;
}

export async function updateCalendarEvent(
  email: string,
  id: string,
  patch: Partial<
    Pick<
      CalendarEvent,
      "summary" | "description" | "location" | "start" | "end" | "allDay"
    >
  >,
): Promise<CalendarEvent | null> {
  const events = await getEvents(email);
  const idx = events.findIndex((e) => e.id === id);
  if (idx < 0) return null;

  const current = events[idx];
  const next: CalendarEvent = {
    ...current,
    ...patch,
    summary:
      patch.summary !== undefined ? patch.summary.trim() : current.summary,
    description:
      patch.description !== undefined
        ? patch.description.trim()
        : current.description,
    location:
      patch.location !== undefined ? patch.location.trim() : current.location,
    updatedAt: new Date().toISOString(),
  };
  events[idx] = next;
  await saveEvents(email, events);
  return next;
}

export async function deleteCalendarEvent(
  email: string,
  id: string,
): Promise<boolean> {
  const events = await getEvents(email);
  const next = events.filter((e) => e.id !== id);
  if (next.length === events.length) return false;
  await saveEvents(email, next);
  return true;
}
