import { getEmailClientSettings } from "@/lib/cpanel";
import { getImapConfig, getSmtpConfig } from "@/lib/env";
import { appendToInbox } from "@/lib/imap";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Deliver a properly formatted mail-client settings message into the new
 * mailbox. Avoids cPanel API send_welcome_email, which often lands as raw MIME.
 */
export async function deliverMailboxWelcomeEmail(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const address = email.trim().toLowerCase();
  const domain = address.split("@")[1] || "mail";

  let inboxHost = `mail.${domain}`;
  let inboxPort = 993;
  let smtpHost = inboxHost;
  let smtpPort = 465;
  let popPort = 995;

  try {
    const fromCpanel = await getEmailClientSettings(address);
    if (fromCpanel.ok && fromCpanel.settings) {
      inboxHost = fromCpanel.settings.inboxHost;
      inboxPort = fromCpanel.settings.inboxPort;
      smtpHost = fromCpanel.settings.smtpHost;
      smtpPort = fromCpanel.settings.smtpPort;
      popPort = fromCpanel.settings.popPort || 995;
    } else {
      const imap = getImapConfig();
      const smtp = getSmtpConfig();
      inboxHost = imap.host || inboxHost;
      inboxPort = imap.port || inboxPort;
      smtpHost = smtp.host || smtpHost;
      smtpPort = smtp.port || smtpPort;
    }
  } catch {
    try {
      const imap = getImapConfig();
      const smtp = getSmtpConfig();
      inboxHost = imap.host || inboxHost;
      inboxPort = imap.port || inboxPort;
      smtpHost = smtp.host || smtpHost;
      smtpPort = smtp.port || smtpPort;
    } catch {
      /* use domain defaults */
    }
  }

  const subject = `[${domain}] Client configuration settings for “${address}”`;
  const text = [
    `Client configuration settings for “${address}”.`,
    "",
    "Mail Client Manual Settings",
    "Secure SSL/TLS Settings (Recommended)",
    "",
    `Username: ${address}`,
    "Password: Use the email account’s password.",
    `Incoming Server: ${inboxHost}`,
    `IMAP Port: ${inboxPort}`,
    `POP3 Port: ${popPort}`,
    `Outgoing Server: ${smtpHost}`,
    `SMTP Port: ${smtpPort}`,
    "",
    "IMAP, POP3, and SMTP require authentication.",
    "",
    "You can also sign in with RamerLabs Webmail using this address and password.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:Segoe UI,Arial,sans-serif;color:#1a1a1a;line-height:1.5;max-width:640px;margin:0 auto;padding:24px;">
  <h1 style="font-size:20px;margin:0 0 16px;">Mail Client Manual Settings</h1>
  <p style="margin:0 0 20px;">Client configuration settings for <strong>${escapeHtml(address)}</strong>.</p>
  <h2 style="font-size:15px;margin:0 0 10px;">Secure SSL/TLS Settings (Recommended)</h2>
  <table style="border-collapse:collapse;width:100%;font-size:14px;">
    <tr><td style="padding:6px 0;color:#666;width:160px;">Username</td><td style="padding:6px 0;"><code>${escapeHtml(address)}</code></td></tr>
    <tr><td style="padding:6px 0;color:#666;">Password</td><td style="padding:6px 0;">Use the email account’s password.</td></tr>
    <tr><td style="padding:6px 0;color:#666;">Incoming Server</td><td style="padding:6px 0;"><code>${escapeHtml(inboxHost)}</code></td></tr>
    <tr><td style="padding:6px 0;color:#666;">IMAP Port</td><td style="padding:6px 0;">${inboxPort}</td></tr>
    <tr><td style="padding:6px 0;color:#666;">POP3 Port</td><td style="padding:6px 0;">${popPort}</td></tr>
    <tr><td style="padding:6px 0;color:#666;">Outgoing Server</td><td style="padding:6px 0;"><code>${escapeHtml(smtpHost)}</code></td></tr>
    <tr><td style="padding:6px 0;color:#666;">SMTP Port</td><td style="padding:6px 0;">${smtpPort}</td></tr>
  </table>
  <p style="margin:20px 0 0;font-size:13px;color:#555;">IMAP, POP3, and SMTP require authentication.</p>
  <p style="margin:12px 0 0;font-size:13px;color:#555;">You can also sign in with RamerLabs Webmail using this address and password.</p>
</body>
</html>`;

  // Brief delay so cPanel finishes provisioning before IMAP auth
  await new Promise((r) => setTimeout(r, 800));

  return appendToInbox(address, password, {
    from: `cpanel@${domain}`,
    fromName: `cPanel on ${domain}`,
    subject,
    text,
    html,
  });
}
