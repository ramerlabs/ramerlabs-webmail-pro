import { createDAVClient } from "tsdav";

type DavClient = Awaited<ReturnType<typeof createDAVClient>>;

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/** CardDAV/CalDAV base (cPanel typically :2080). */
export function getDavServerUrl(): string {
  const configured = optional("DAV_SERVER_URL").trim();
  if (configured) return configured.replace(/\/$/, "");

  const host =
    optional("IMAP_HOST") ||
    optional("CPANEL_HOST") ||
    "mail.vccbusiness.com";
  const port = optional("DAV_PORT", "2080");
  return `https://${host}:${port}`;
}

async function createClient(
  email: string,
  password: string,
  accountType: "carddav" | "caldav",
): Promise<DavClient> {
  return createDAVClient({
    serverUrl: getDavServerUrl(),
    credentials: {
      username: email,
      password,
    },
    authMethod: "Basic",
    defaultAccountType: accountType,
  });
}

export interface Contact {
  url: string;
  etag?: string;
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  org: string;
}

function parseVCard(data: string): Omit<Contact, "url" | "etag"> {
  const lines = data.replace(/\r\n /g, "").split(/\r?\n/);
  const get = (key: string) => {
    const line = lines.find(
      (l) =>
        l.toUpperCase().startsWith(`${key.toUpperCase()}:`) ||
        l.toUpperCase().startsWith(`${key.toUpperCase()};`),
    );
    if (!line) return "";
    const idx = line.indexOf(":");
    return idx >= 0 ? line.slice(idx + 1).trim() : "";
  };

  const emailLine = lines.find((l) => l.toUpperCase().startsWith("EMAIL"));
  const email =
    emailLine && emailLine.includes(":")
      ? emailLine.slice(emailLine.indexOf(":") + 1).trim()
      : "";

  const telLine = lines.find((l) => l.toUpperCase().startsWith("TEL"));
  const phone =
    telLine && telLine.includes(":")
      ? telLine.slice(telLine.indexOf(":") + 1).trim()
      : "";

  return {
    uid: get("UID") || `local-${Date.now()}`,
    fullName: get("FN") || get("N").replace(/;/g, " ").trim() || "Unnamed",
    email,
    phone,
    org: get("ORG").replace(/;/g, " ").trim(),
  };
}

export async function listContacts(
  email: string,
  password: string,
): Promise<Contact[]> {
  const client = await createClient(email, password, "carddav");
  const addressBooks = await client.fetchAddressBooks();
  if (!addressBooks.length) return [];

  const book = addressBooks[0];
  const objects = await client.fetchVCards({ addressBook: book });

  return objects
    .map((obj) => {
      const parsed = parseVCard(obj.data || "");
      return {
        ...parsed,
        url: obj.url,
        etag: obj.etag,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function buildVCard(input: {
  uid: string;
  fullName: string;
  email?: string;
  phone?: string;
  org?: string;
}): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `UID:${input.uid}`,
    `FN:${input.fullName}`,
    `N:${input.fullName};;;;`,
  ];
  if (input.email) lines.push(`EMAIL;TYPE=INTERNET:${input.email}`);
  if (input.phone) lines.push(`TEL;TYPE=CELL:${input.phone}`);
  if (input.org) lines.push(`ORG:${input.org}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export async function createContact(
  email: string,
  password: string,
  input: { fullName: string; email?: string; phone?: string; org?: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await createClient(email, password, "carddav");
    const addressBooks = await client.fetchAddressBooks();
    if (!addressBooks.length) {
      return { ok: false, error: "No address book found on the server." };
    }
    const uid = crypto.randomUUID();
    const filename = `${uid}.vcf`;
    await client.createVCard({
      addressBook: addressBooks[0],
      filename,
      vCardString: buildVCard({ uid, ...input }),
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create contact",
    };
  }
}

export async function deleteContact(
  email: string,
  password: string,
  url: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await createClient(email, password, "carddav");
    await client.deleteVCard({ vCard: { url } });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete contact",
    };
  }
}

export interface CalendarEvent {
  url: string;
  uid: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
}

function unfoldIcal(data: string): string[] {
  return data.replace(/\r\n[ \t]/g, "").split(/\r?\n/);
}

function parseIcalDate(value: string): { iso: string; allDay: boolean } {
  const cleaned = value.replace(/^VALUE=DATE:/i, "").trim();
  if (/^\d{8}$/.test(cleaned)) {
    const y = cleaned.slice(0, 4);
    const m = cleaned.slice(4, 6);
    const d = cleaned.slice(6, 8);
    return { iso: `${y}-${m}-${d}`, allDay: true };
  }
  const match = cleaned.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/,
  );
  if (match) {
    const [, y, mo, d, h, mi, s, z] = match;
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z || ""}`;
    return { iso, allDay: false };
  }
  return { iso: cleaned, allDay: false };
}

function parseVEvent(data: string): Omit<CalendarEvent, "url"> | null {
  const lines = unfoldIcal(data);
  const get = (key: string) => {
    const line = lines.find(
      (l) =>
        l.toUpperCase() === key.toUpperCase() ||
        l.toUpperCase().startsWith(`${key.toUpperCase()}:`) ||
        l.toUpperCase().startsWith(`${key.toUpperCase()};`),
    );
    if (!line) return "";
    const idx = line.indexOf(":");
    return idx >= 0 ? line.slice(idx + 1).trim() : "";
  };

  const summary = get("SUMMARY");
  if (!summary && !get("UID")) return null;

  const dtStart = get("DTSTART");
  const dtEnd = get("DTEND");
  const start = dtStart ? parseIcalDate(dtStart) : { iso: "", allDay: false };
  const end = dtEnd ? parseIcalDate(dtEnd) : start;

  return {
    uid: get("UID") || `evt-${Date.now()}`,
    summary: summary || "(no title)",
    description: get("DESCRIPTION").replace(/\\n/g, "\n"),
    location: get("LOCATION"),
    start: start.iso,
    end: end.iso,
    allDay: start.allDay,
  };
}

export async function listEvents(
  email: string,
  password: string,
): Promise<CalendarEvent[]> {
  const client = await createClient(email, password, "caldav");
  const calendars = await client.fetchCalendars();
  if (!calendars.length) return [];

  const objects = await client.fetchCalendarObjects({
    calendar: calendars[0],
  });

  const events: CalendarEvent[] = [];
  for (const obj of objects) {
    const parsed = parseVEvent(obj.data || "");
    if (!parsed) continue;
    events.push({ ...parsed, url: obj.url });
  }

  return events.sort((a, b) => a.start.localeCompare(b.start));
}

function formatIcalDate(iso: string, allDay: boolean): string {
  if (allDay || /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return iso.replace(/-/g, "").slice(0, 8);
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function buildVEvent(input: {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay?: boolean;
}): string {
  const allDay = Boolean(input.allDay || /^\d{4}-\d{2}-\d{2}$/.test(input.start));
  const dtStart = formatIcalDate(input.start, allDay);
  const dtEnd = formatIcalDate(input.end || input.start, allDay);
  const stamp = formatIcalDate(new Date().toISOString(), false);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RamerLabs//Webmail//EN",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${stamp}`,
    allDay ? `DTSTART;VALUE=DATE:${dtStart}` : `DTSTART:${dtStart}`,
    allDay ? `DTEND;VALUE=DATE:${dtEnd}` : `DTEND:${dtEnd}`,
    `SUMMARY:${input.summary}`,
  ];
  if (input.description) {
    lines.push(`DESCRIPTION:${input.description.replace(/\n/g, "\\n")}`);
  }
  if (input.location) lines.push(`LOCATION:${input.location}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

export async function createEvent(
  email: string,
  password: string,
  input: {
    summary: string;
    description?: string;
    location?: string;
    start: string;
    end: string;
    allDay?: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await createClient(email, password, "caldav");
    const calendars = await client.fetchCalendars();
    if (!calendars.length) {
      return { ok: false, error: "No calendar found on the server." };
    }
    const uid = crypto.randomUUID();
    await client.createCalendarObject({
      calendar: calendars[0],
      filename: `${uid}.ics`,
      iCalString: buildVEvent({ uid, ...input }),
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create event",
    };
  }
}

export async function deleteEvent(
  email: string,
  password: string,
  url: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await createClient(email, password, "caldav");
    await client.deleteCalendarObject({
      calendarObject: { url },
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete event",
    };
  }
}
