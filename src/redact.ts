// The web app's redaction for public posts, so a brag from the CLI hides the same
// details: links, emails, internal hosts, IPs, ticket ids, exact amounts, account ids and phones.

export interface Redaction {
  field: string;
  original: string;
  replacement: string;
  reason: string;
}

const MULTIPLIERS: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };

/** "$1.2m" → "a 7-figure sum"; "a $40k deal" → "a 5-figure deal". */
function amount(match: string): string {
  const withArticle = /^an?\s/i.test(match);
  const m = /(\d+(?:\.\d+)?)\s*(k|m|bn|b|thousand|million|billion)?/i.exec(match.replace(/,/g, ''));
  if (!m) return 'an amount';
  const value = Number.parseFloat(m[1]!) * (MULTIPLIERS[(m[2] ?? '').toLowerCase()] ?? 1);
  const digits = Math.max(1, Math.floor(Math.log10(Math.max(value, 1))) + 1);
  const article = [8, 11, 18].includes(digits) ? 'an' : 'a';
  if (!withArticle) return `${article} ${digits}-figure sum`;
  return `${/^A/.test(match) ? article[0]!.toUpperCase() + article.slice(1) : article} ${digits}-figure`;
}

const RULES: { reason: string; re: RegExp; to: (match: string) => string | null }[] = [
  { reason: 'link', re: /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi, to: () => '[link]' },
  { reason: 'email address', re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, to: () => '[email]' },
  { reason: 'internal host name', re: /\b[\w-]+(?:\.[\w-]+)*\.(?:internal|corp|local|lan|intranet|int)\b/gi, to: () => '[internal host]' },
  { reason: 'IP address', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, to: () => '[IP address]' },
  { reason: 'ticket id', re: /\b[A-Z][A-Z0-9]{1,9}-\d{1,6}\b/g, to: () => '[ticket]' },
  {
    reason: 'exact amount',
    re: /(?:\b(?:an?\s))?(?:[$€£¥]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|bn|b|thousand|million|billion)\b)?|\b\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|bn|thousand|million|billion))?\s?(?:USD|EUR|GBP|dollars|euros|pounds)\b)/gi,
    to: amount,
  },
  { reason: 'account id', re: /\b\d{12}\b/g, to: () => '[account id]' },
  { reason: 'phone number', re: /(?:\+|\b)\d[\d\s().-]{7,}\d\b/g, to: (m) => ((m.match(/\d/g) ?? []).length >= 9 ? '[phone]' : null) },
];

/**
 * Redacts the given text fields of `fields`, and each string in a list field such as skills
 * (which become public hashtags); returns the cleaned copy and what changed.
 */
export function redact<T extends Record<string, unknown>>(
  fields: T,
  keys: string[] = ['title', 'message', 'impact', 'timeSpent', 'skills'],
): { fields: T; redactions: Redaction[] } {
  const out: Record<string, unknown> = { ...fields };
  const redactions: Redaction[] = [];
  const clean = (field: string, text: string) => {
    for (const { reason, re, to } of RULES) {
      text = text.replace(re, (original) => {
        const replacement = to(original);
        if (!replacement) return original;
        redactions.push({ field, original, replacement, reason });
        return replacement;
      });
    }
    return text;
  };
  for (const field of keys) {
    const value = out[field];
    if (Array.isArray(value)) out[field] = value.map((v) => (typeof v === 'string' ? clean(field, v) : v));
    else if (typeof value === 'string' && value) out[field] = clean(field, value);
  }
  return { fields: out as T, redactions };
}
