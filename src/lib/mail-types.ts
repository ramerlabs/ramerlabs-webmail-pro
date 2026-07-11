export type MailFolder =
  | "INBOX"
  | "Sent"
  | "Drafts"
  | "Trash"
  | "Junk"
  | "Archive";

export interface MailListItem {
  uid: number;
  seq: number;
  subject: string;
  from: string;
  fromEmail: string;
  to: string;
  toEmail: string;
  cc?: string;
  date: string;
  snippet: string;
  seen: boolean;
  flagged: boolean;
}

export interface MailMessage extends MailListItem {
  html: string | null;
  text: string | null;
}
