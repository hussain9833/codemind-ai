/**
 * Secret redaction applied to ALL repository text before it can reach a model. Secrets
 * are also excluded at indexing time (.env, keys), but they can still sit inside source files.
 */
const PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED AWS KEY]"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, "[REDACTED GITHUB TOKEN]"],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}\b/g, "[REDACTED GITHUB TOKEN]"],
  [/\bnvapi-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED API KEY]"],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED API KEY]"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "[REDACTED SLACK TOKEN]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED JWT]"],
  [/\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@/gi, "$1://[REDACTED]@"],
  // key = "value" assignments for sensitive names
  [/((?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key|client[_-]?secret)["']?\s*[:=]\s*)(["'])[^"'\n]{6,}\2/gi, "$1$2[REDACTED]$2"],
];

export function redactSecrets(text: string): string {
  return PATTERNS.reduce((t, [re, rep]) => t.replace(re, rep), text);
}
