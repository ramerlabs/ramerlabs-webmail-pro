import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";
import { normalizeEmail } from "@/lib/auth-crypto";

export interface ContactItem {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  org: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

function storeKey(email: string): string {
  return `webmail:contacts:${normalizeEmail(email)}`;
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function localStorePath(): string {
  return path.join(process.cwd(), ".data", "contacts.json");
}

async function readLocalStore(): Promise<Record<string, ContactItem[]>> {
  try {
    const raw = await readFile(localStorePath(), "utf8");
    return JSON.parse(raw) as Record<string, ContactItem[]>;
  } catch {
    return {};
  }
}

async function writeLocalStore(
  data: Record<string, ContactItem[]>,
): Promise<void> {
  const file = localStorePath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

async function getContacts(email: string): Promise<ContactItem[]> {
  const redis = getRedis();
  if (redis) {
    const value = await redis.get<ContactItem[]>(storeKey(email));
    return Array.isArray(value) ? value : [];
  }
  const store = await readLocalStore();
  return store[normalizeEmail(email)] || [];
}

async function saveContacts(
  email: string,
  contacts: ContactItem[],
): Promise<ContactItem[]> {
  const normalized = normalizeEmail(email);
  const redis = getRedis();
  if (redis) {
    await redis.set(storeKey(normalized), contacts);
    return contacts;
  }
  if (process.env.VERCEL) {
    throw new Error(
      "Contacts require Upstash Redis on Vercel. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    );
  }
  const store = await readLocalStore();
  store[normalized] = contacts;
  await writeLocalStore(store);
  return contacts;
}

export async function listAppContacts(email: string): Promise<ContactItem[]> {
  const contacts = await getContacts(email);
  return [...contacts]
    .map((c) => ({
      ...c,
      description: c.description || "",
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export async function createAppContact(
  email: string,
  input: {
    fullName: string;
    email?: string;
    phone?: string;
    org?: string;
    description?: string;
  },
): Promise<ContactItem> {
  const now = new Date().toISOString();
  const item: ContactItem = {
    id: randomUUID(),
    fullName: input.fullName.trim(),
    email: (input.email || "").trim(),
    phone: (input.phone || "").trim(),
    org: (input.org || "").trim(),
    description: (input.description || "").trim(),
    createdAt: now,
    updatedAt: now,
  };
  const contacts = await getContacts(email);
  contacts.unshift(item);
  await saveContacts(email, contacts);
  return item;
}

export async function deleteAppContact(
  email: string,
  id: string,
): Promise<boolean> {
  const contacts = await getContacts(email);
  const next = contacts.filter((c) => c.id !== id);
  if (next.length === contacts.length) return false;
  await saveContacts(email, next);
  return true;
}
