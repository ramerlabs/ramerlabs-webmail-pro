import { z } from "zod";

const usernameRegex = /^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/i;

export const signupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(
      usernameRegex,
      "Username may only contain letters, numbers, dots, hyphens, and underscores",
    ),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
  recoveryEmail: z
    .string()
    .trim()
    .email("Enter a valid recovery email address"),
  captchaToken: z.string().optional(),
  /** Optional; must be in the allowed signup domain list. */
  domain: z.string().trim().min(1).max(253).optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const login2faSchema = z.object({
  pendingToken: z.string().min(10),
  code: z.string().min(4).max(64),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
});

export const fetchMailSchema = z.object({
  folder: z
    .enum(["INBOX", "Sent", "Drafts", "Trash", "Junk", "Archive"])
    .optional()
    .default("INBOX"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  search: z.string().max(200).optional(),
});

export const sendMailSchema = z.object({
  to: z.string().min(1, "Recipient is required"),
  subject: z.string().min(1, "Subject is required").max(998),
  body: z.string().min(1, "Message body is required"),
  html: z.boolean().optional(),
  cc: z.string().optional().or(z.literal("")),
  bcc: z.string().optional().or(z.literal("")),
});
