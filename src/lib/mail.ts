import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";
import { log } from "./log";

/**
 * Email over SMTP (Gmail App Password works out of the box).
 * - Configure SMTP_USER + SMTP_PASS in .env.local (see .env.example).
 * - With no SMTP settings in development, the message is printed to the server console instead,
 *   so the flow can be tried locally. In production without SMTP, email reset is reported as unavailable.
 */
export const smtpConfigured = () => !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
const devFallback = () => process.env.NODE_ENV !== "production" && !smtpConfigured();
/** True when we can really send, or (in dev) show the code in the console. */
export const emailResetAvailable = () => smtpConfigured() || devFallback();

let transporter: Transporter | undefined;
function getTransporter(): Transporter {
  if (transporter) return transporter;
  const e = env();
  const port = e.SMTP_PORT ?? 465;
  transporter = nodemailer.createTransport({
    host: e.SMTP_HOST ?? "smtp.gmail.com",
    port,
    secure: port === 465, // SSL on 465; STARTTLS on 587
    // Google shows App Passwords as "abcd efgh ijkl mnop"; spaces are not part of the password.
    auth: { user: e.SMTP_USER!, pass: (e.SMTP_PASS ?? "").replace(/\s+/g, "") },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

export async function sendMail(opts: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
  if (devFallback()) {
    console.log(`\n[dev mail] To: ${opts.to}\n[dev mail] Subject: ${opts.subject}\n${opts.text}\n`);
    return true;
  }
  if (!smtpConfigured()) return false;
  const e = env();
  try {
    // MAIL_FROM may be a full address ("Name <a@b.com>") or just a display name ("CodeMind AI").
    const from = !e.MAIL_FROM ? `CodeMind AI <${e.SMTP_USER}>` : e.MAIL_FROM.includes("@") ? e.MAIL_FROM : `"${e.MAIL_FROM.replace(/"/g, "")}" <${e.SMTP_USER}>`;
    await getTransporter().sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text, html: opts.html });
    return true;
  } catch (err) {
    // Log the SMTP error code only (e.g. EAUTH = wrong app password). Never the credentials.
    log.warn("mail.send_failed", { code: (err as { code?: string }).code, responseCode: (err as { responseCode?: number }).responseCode });
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function otpEmail(name: string | null, code: string, minutes: number) {
  const hello = name ? `Hi ${name},` : "Hi,";
  const text = `${hello}\n\nYour CodeMind AI password reset code is:\n\n    ${code}\n\nIt expires in ${minutes} minutes and can be used once. If you did not ask for this, ignore this email; your password has not changed. Never share this code with anyone.\n`;
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;color:#11131b"><h2 style="margin:0 0 12px">Your password reset code</h2><p>${esc(hello)}</p><p>Use this code to reset your CodeMind AI password:</p><p style="font-size:34px;letter-spacing:10px;font-weight:700;margin:20px 0;padding:16px;background:#f0f2f8;border-radius:10px;text-align:center;font-family:ui-monospace,Consolas,monospace">${esc(code)}</p><p style="font-size:13px;color:#666">It expires in ${minutes} minutes and works once. If you did not ask for this, ignore this email; your password has not changed. Never share this code with anyone.</p></div>`;
  return { subject: `${code} is your CodeMind AI reset code`, text, html };
}
