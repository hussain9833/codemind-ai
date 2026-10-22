import "server-only";
import { env } from "./env";
import { log } from "./log";

/**
 * Transactional email through Resend's HTTP API (no extra dependency).
 * In development with no RESEND_API_KEY, the message is printed to the server console instead,
 * so the flow can be tried locally. In production without a key, email is simply unavailable.
 */
export const mailConfigured = () => !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;
const devFallback = () => process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY;
/** True when we can actually deliver (or, in dev, show the link in the console). */
export const emailResetAvailable = () => mailConfigured() || devFallback();

export async function sendMail(opts: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
  if (devFallback()) {
    console.log(`\n[dev mail] To: ${opts.to}\n[dev mail] Subject: ${opts.subject}\n${opts.text}\n`);
    return true;
  }
  const e = env();
  if (!e.RESEND_API_KEY || !e.MAIL_FROM) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: e.MAIL_FROM, to: [opts.to], subject: opts.subject, text: opts.text, html: opts.html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) log.warn("mail.send_failed", { status: res.status });
    return res.ok;
  } catch {
    log.warn("mail.send_error");
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function resetEmail(name: string | null, link: string, minutes: number) {
  const hello = name ? `Hi ${name},` : "Hi,";
  const text = `${hello}\n\nSomeone asked to reset the password for your CodeMind AI account. Use this link within ${minutes} minutes:\n\n${link}\n\nIf you did not ask for this, ignore this email. Your password stays the same.\n`;
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;color:#11131b"><h2 style="margin:0 0 12px">Reset your password</h2><p>${esc(hello)}</p><p>Someone asked to reset the password for your CodeMind AI account. The link works for ${minutes} minutes and only once.</p><p style="margin:24px 0"><a href="${esc(link)}" style="background:#4a56d6;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">Choose a new password</a></p><p style="font-size:13px;color:#666">Or paste this into your browser:<br>${esc(link)}</p><p style="font-size:13px;color:#666">If you did not ask for this, ignore this email. Your password stays the same.</p></div>`;
  return { subject: "Reset your CodeMind AI password", text, html };
}
