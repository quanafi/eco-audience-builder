/**
 * Pure helpers for ad-platform Customer Match / Custom Audience uploads.
 *
 * Port of app/ads_normalize.py. No DB, no network — just the normalization + SHA-256
 * hashing each platform requires, identifier-coverage counting, and a benchmark-based
 * match-rate *estimate*. Kept separate from lib/ads.ts (the I/O / mock-client seam) so
 * this is trivially unit-testable with known hash vectors.
 *
 * Both Google Ads (Customer Match) and Meta (Custom Audiences) match users by uploading
 * SHA-256 hashes of *normalized* PII (email, phone in E.164, first/last name, zip,
 * country). The platforms only report a real match rate *after* an upload — see
 * estimateMatchRate for the honest, clearly-labeled offline approximation.
 */
import { createHash } from 'node:crypto';
import { ValidationError } from './errors';
import type { Coverage, MatchRateEstimate } from './types';

/** A loosely-typed customer PII row (the keys the builders look up). */
export interface PiiCustomer {
  customer_id?: unknown;
  name?: unknown;
  email?: unknown;
  phone_number?: unknown;
  zip?: unknown;
  country?: unknown;
  [key: string]: unknown;
}

// Gmail-family domains get extra normalization under Google's spec (dots in the local
// part are ignored and a "+tag" suffix is stripped). Meta does not do this.
const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/** Coerce a raw cell to a trimmable string, or null when absent (mirrors Python's
 * `if not raw` falsiness for None/empty). */
function asStr(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw);
  return s === '' ? null : s;
}

/** Hex SHA-256 of a UTF-8 string — the hash form both platforms expect. */
export function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

// ----------------------------------------------------------------- normalization

/** Trim + lowercase an email. With gmailRules (Google only), strip dots and any
 * '+tag' from the local part of gmail/googlemail addresses. Returns null if blank or
 * obviously not an address. */
export function normEmail(raw: unknown, opts: { gmailRules?: boolean } = {}): string | null {
  const s = asStr(raw);
  if (s === null) return null;
  let e = s.trim().toLowerCase();
  if (!e.includes('@') || e.startsWith('@') || e.endsWith('@')) return null;
  if (opts.gmailRules) {
    const at = e.indexOf('@');
    let local = e.slice(0, at);
    const domain = e.slice(at + 1);
    if (GMAIL_DOMAINS.has(domain)) {
      local = local.split('+', 1)[0].replace(/\./g, '');
      e = `${local}@${domain}`;
    }
  }
  return e;
}

/** Normalize a phone to E.164 (e.g. '+16145550100'). Keeps digits only; a bare
 * 10-digit US number gets a '+1'; an 11-digit number starting with 1 is treated as US.
 * Returns null if fewer than 10 digits remain (not a dialable number). */
export function normPhone(raw: unknown, opts: { defaultCountry?: string } = {}): string | null {
  const s = asStr(raw);
  if (s === null) return null;
  const defaultCountry = opts.defaultCountry ?? 'US';
  let digits = s.replace(/\D/g, '');
  if (defaultCountry === 'US') {
    if (digits.length === 10) digits = '1' + digits;
    if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  }
  if (digits.length < 10) return null;
  return '+' + digits;
}

/** Lowercase, trim, collapse internal whitespace, drop punctuation/digits. */
export function normName(raw: unknown): string | null {
  const s = asStr(raw);
  if (s === null) return null;
  let n = s.trim().toLowerCase().replace(/[^a-z\s]/g, '');
  n = n.replace(/\s+/g, ' ').trim();
  return n || null;
}

/** Best-effort [first, last] from the mart's single `name` column. First token is the
 * first name, the remainder is the last name. Both null if unusable, and last is null
 * when only one token is present (Google addressInfo needs both). */
export function splitName(full: unknown): [string | null, string | null] {
  const n = normName(full);
  if (!n) return [null, null];
  const parts = n.split(' ');
  if (parts.length === 1) return [parts[0], null];
  return [parts[0], parts.slice(1).join(' ')];
}

/** First 5 US digits of a postal code. null if absent. */
export function normZip(raw: unknown): string | null {
  const s = asStr(raw);
  if (s === null) return null;
  const m = s.match(/\d{5}/);
  return m ? m[0] : null;
}

/** 2-letter ISO country, lowercase. Defaults to 'us' (Eco Plumbers is Ohio-based). */
export function normCountry(raw: unknown): string {
  const s = asStr(raw);
  if (s !== null) {
    const c = s.trim().toLowerCase().replace(/[^a-z]/g, '');
    if (c.length === 2) return c;
  }
  return 'us';
}

// ----------------------------------------------------- per-platform hashed records

/** Build a Google Ads Customer Match UserIdentifier list for one customer.
 *
 * Mirrors the OfflineUserDataJob `userIdentifiers` shape: hashedEmail and
 * hashedPhoneNumber are standalone identifiers; first/last name are hashed inside an
 * addressInfo block where countryCode and postalCode are sent *unhashed* (per Google's
 * spec). Only identifiers the customer actually has are emitted. */
export function googleUserIdentifiers(cust: PiiCustomer): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const email = normEmail(cust.email, { gmailRules: true });
  if (email) out.push({ hashedEmail: sha256(email) });
  const phone = normPhone(cust.phone_number);
  if (phone) out.push({ hashedPhoneNumber: sha256(phone) });
  const [first, last] = splitName(cust.name);
  const zip = normZip(cust.zip);
  if (first && last && zip) {
    out.push({
      addressInfo: {
        hashedFirstName: sha256(first),
        hashedLastName: sha256(last),
        countryCode: normCountry(cust.country).toUpperCase(),
        postalCode: zip,
      },
    });
  }
  return out;
}

export const META_SCHEMA = ['EMAIL', 'PHONE', 'FN', 'LN', 'ZIP', 'COUNTRY'];

/** Build a Meta Custom Audiences data row for the schema
 * [EMAIL, PHONE, FN, LN, ZIP, COUNTRY]. Every present field is SHA-256 hashed (Meta
 * normalizes then hashes all of these, including zip/country); missing fields are an
 * empty string so the row still aligns with the fixed schema. */
export function metaUserRecord(cust: PiiCustomer): string[] {
  const email = normEmail(cust.email);
  const phone = normPhone(cust.phone_number);
  const [first, last] = splitName(cust.name);
  const zip = normZip(cust.zip);
  const country = normCountry(cust.country);
  return [
    email ? sha256(email) : '',
    phone ? sha256(phone) : '',
    first ? sha256(first) : '',
    last ? sha256(last) : '',
    zip ? sha256(zip) : '',
    sha256(country),
  ];
}

// ----------------------------------------------------------------------- coverage

/** Count how many customers carry each hashable identifier. `hasNameZip` requires a
 * splittable first+last name AND a zip (the weakest signal). `hasAnyIdentifier` is the
 * addressable set — anyone with at least one usable identifier. */
export function coverage(customers: PiiCustomer[]): Coverage {
  const total = customers.length;
  let hasEmail = 0;
  let hasPhone = 0;
  let hasNameZip = 0;
  let hasAny = 0;
  for (const c of customers) {
    const email = Boolean(normEmail(c.email));
    const phone = Boolean(normPhone(c.phone_number));
    const [first, last] = splitName(c.name);
    const nameZip = Boolean(first && last && normZip(c.zip));
    if (email) hasEmail += 1;
    if (phone) hasPhone += 1;
    if (nameZip) hasNameZip += 1;
    if (email || phone || nameZip) hasAny += 1;
  }
  return {
    total,
    hasEmail,
    hasPhone,
    hasNameZip,
    hasAnyIdentifier: hasAny,
  };
}

// ---------------------------------------------------------- match-rate estimate

/** Published industry benchmark ranges for how many *uploaded, valid* identifiers a
 * platform typically matches to a real user — NOT a platform-reported rate. Email and
 * phone match far better than name+zip alone. Tune freely; this is the single knob. */
export const BENCHMARK_MULTIPLIERS: Record<
  string,
  { email: [number, number]; phone: [number, number]; name_zip: [number, number] }
> = {
  google: { email: [0.6, 0.8], phone: [0.55, 0.75], name_zip: [0.4, 0.6] },
  meta: { email: [0.55, 0.75], phone: [0.5, 0.7], name_zip: [0.35, 0.55] },
};

const DISCLAIMER = (platform: string): string =>
  `Estimate from published industry benchmarks — NOT a ${platform}-reported match ` +
  `rate. The true rate is only known after a real upload.`;

/** Title-case a single word (mirrors Python str.title for the single-token platform
 * names used here). */
function title(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

/** Round to one decimal place (mirrors Python round(x, 1), banker's-rounding aside —
 * the inputs here are percentages of integer counts so half-way ties are rare). */
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** Predict a match-rate range for an audience from its identifier coverage.
 *
 * Method (transparent, prototype-grade): blend the per-identifier benchmark multipliers,
 * weighted by how many customers carry each identifier, then apply that blended rate to
 * the addressable set (hasAnyIdentifier). This is a coarse estimate, not a
 * platform-reported number — see `disclaimer`. */
export function estimateMatchRate(cov: Coverage, platform: string): MatchRateEstimate {
  const mult = BENCHMARK_MULTIPLIERS[platform];
  if (mult === undefined) {
    throw new ValidationError(`Unknown platform: ${platform}`);
  }
  const total = cov.total || 0;
  const addressable = cov.hasAnyIdentifier || 0;
  const weights = {
    email: cov.hasEmail || 0,
    phone: cov.hasPhone || 0,
    name_zip: cov.hasNameZip || 0,
  };
  const wsum = weights.email + weights.phone + weights.name_zip;
  if (wsum === 0 || addressable === 0) {
    return {
      lowPct: 0.0,
      highPct: 0.0,
      lowCount: 0,
      highCount: 0,
      basis: 'no hashable identifiers in this audience',
      disclaimer: DISCLAIMER(title(platform)),
    };
  }
  const keys = ['email', 'phone', 'name_zip'] as const;
  const blendedLo = keys.reduce((acc, k) => acc + mult[k][0] * weights[k], 0) / wsum;
  const blendedHi = keys.reduce((acc, k) => acc + mult[k][1] * weights[k], 0) / wsum;
  const lowCount = Math.round(addressable * blendedLo);
  const highCount = Math.round(addressable * blendedHi);
  const pct = (c: number): number => (total ? round1((c / total) * 100) : 0.0);
  return {
    lowPct: pct(lowCount),
    highPct: pct(highCount),
    lowCount,
    highCount,
    basis: 'identifier coverage × blended industry benchmark, on the addressable set',
    disclaimer: DISCLAIMER(title(platform)),
  };
}
