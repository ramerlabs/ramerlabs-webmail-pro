import { isAdminEmail } from "@/lib/admin";
import { hydrateProcessEnvFromConfig } from "@/lib/app-config";
import {
  getIronSession,
  type SessionOptions,
} from "iron-session";
import { cookies } from "next/headers";
import { getSessionSecret } from "@/lib/env";
import {
  defaultSettings,
  type UserSettings,
} from "@/lib/settings-types";

export type { ReplyBehavior, UserSettings } from "@/lib/settings-types";
export { defaultSettings } from "@/lib/settings-types";

export interface SessionData {
  isLoggedIn: boolean;
  /** True when signed in via /admin/login (app installer account). */
  isAppAdmin?: boolean;
  email: string;
  /** Encrypted at rest by iron-session cookie sealing */
  password: string;
  settings?: UserSettings;
}

export const defaultSession: SessionData = {
  isLoggedIn: false,
  isAppAdmin: false,
  email: "",
  password: "",
  settings: defaultSettings,
};

export function getSessionOptions(): SessionOptions {
  return {
    password: getSessionSecret(),
    cookieName: "ramerlabs_webmail_session",
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    },
  };
}

export async function getSession() {
  await hydrateProcessEnvFromConfig();
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, getSessionOptions());
}

/** Mailbox session (IMAP credentials present). */
export async function requireSession() {
  const session = await getSession();
  if (
    !session.isLoggedIn ||
    !session.email ||
    !session.password ||
    session.isAppAdmin
  ) {
    return null;
  }
  return session;
}

/** App admin (/admin/login) or ADMIN_EMAILS mailbox. */
export async function requireAdminAccess() {
  const session = await getSession();
  if (!session.isLoggedIn) return null;
  if (session.isAppAdmin && session.email) return session;
  if (session.email && session.password && isAdminEmail(session.email)) {
    return session;
  }
  return null;
}

export function getSettings(session: SessionData): UserSettings {
  return {
    ...defaultSettings,
    ...(session.settings || {}),
  };
}
