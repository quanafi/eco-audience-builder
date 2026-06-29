/**
 * Tests for lib/adsNormalize — PII normalization, SHA-256 hashing, identifier coverage,
 * and the benchmark match-rate estimate. Pure functions, no DB / network. Port of
 * tests/test_ads_normalize.py.
 *
 * Hash vectors are pinned to known SHA-256 digests so a change in normalization (which
 * would silently break real-world match rates) fails loudly here.
 */
import { describe, it, expect } from 'vitest';
import * as n from './adsNormalize';
import { ValidationError } from './errors';

// Known SHA-256 hex digests (see the normalized plaintext in each comment).
const H_EMAIL = '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b'; // test@example.com
const H_PHONE = '7bfdced8eeeb99072c4222ec538f87cbf05f24560482f616924d8fd4fa7be681'; // +16145550100
const H_FIRST = '96d9632f363564cc3032521409cf22a852f2032eec099ed5967c0d000cec607a'; // john
const H_LAST = '6627835f988e2c5e50533d491163072d3f4f41f5c8b04630150debb3722ca2dd'; // smith
const H_ZIP = '57d8ea508719b6c5bde9434efaa517f3634119a4c5aa17d78e54f5f7218b6369'; // 43215

// --- normalization ---------------------------------------------------------

describe('normEmail', () => {
  it('trims and lowercases', () => {
    expect(n.normEmail('  Test@Example.com ')).toBe('test@example.com');
    expect(n.sha256(n.normEmail(' Test@Example.com ')!)).toBe(H_EMAIL);
  });

  it('blank or invalid is null', () => {
    expect(n.normEmail('')).toBeNull();
    expect(n.normEmail(null)).toBeNull();
    expect(n.normEmail('not-an-email')).toBeNull();
  });

  it('gmail rules only apply with flag and gmail domain', () => {
    expect(n.normEmail('Jane.Doe+promo@gmail.com')).toBe('jane.doe+promo@gmail.com');
    expect(n.normEmail('Jane.Doe+promo@gmail.com', { gmailRules: true })).toBe('janedoe@gmail.com');
    expect(n.normEmail('Jane.Doe+promo@example.com', { gmailRules: true })).toBe(
      'jane.doe+promo@example.com',
    );
  });
});

describe('normPhone', () => {
  it('to E.164', () => {
    expect(n.normPhone('(614) 555-0100')).toBe('+16145550100');
    expect(n.normPhone('614-555-0100')).toBe('+16145550100');
    expect(n.normPhone('16145550100')).toBe('+16145550100');
    expect(n.sha256(n.normPhone('(614) 555-0100')!)).toBe(H_PHONE);
  });

  it('too short is null', () => {
    expect(n.normPhone('555-0100')).toBeNull();
    expect(n.normPhone('')).toBeNull();
    expect(n.normPhone(null)).toBeNull();
  });
});

describe('splitName', () => {
  it('splits first/last', () => {
    expect(n.splitName('John Smith')).toEqual(['john', 'smith']);
    expect(n.splitName('  JOHN   SMITH ')).toEqual(['john', 'smith']);
    expect(n.splitName('Madonna')).toEqual(['madonna', null]); // single token -> no last name
    expect(n.splitName(null)).toEqual([null, null]);
  });
});

describe('normZip / normCountry', () => {
  it('zip + country', () => {
    expect(n.normZip('43215-1234')).toBe('43215');
    expect(n.normZip('Columbus OH 43215')).toBe('43215');
    expect(n.normZip(null)).toBeNull();
    expect(n.normCountry(null)).toBe('us');
    expect(n.normCountry('US')).toBe('us');
  });
});

// --- per-platform record builders ------------------------------------------

describe('googleUserIdentifiers', () => {
  it('shape and hashes', () => {
    const cust = {
      email: 'test@example.com',
      phone_number: '(614) 555-0100',
      name: 'John Smith',
      zip: '43215',
    };
    const ids = n.googleUserIdentifiers(cust);
    expect(ids).toContainEqual({ hashedEmail: H_EMAIL });
    expect(ids).toContainEqual({ hashedPhoneNumber: H_PHONE });
    const addr = ids.find((i) => 'addressInfo' in i)!.addressInfo as Record<string, unknown>;
    expect(addr.hashedFirstName).toBe(H_FIRST);
    expect(addr.hashedLastName).toBe(H_LAST);
    expect(addr.countryCode).toBe('US'); // country/zip are NOT hashed for Google
    expect(addr.postalCode).toBe('43215');
  });

  it('skips missing identifiers', () => {
    expect(
      n.googleUserIdentifiers({ email: '', phone_number: '', name: '', zip: '' }),
    ).toEqual([]);
    // Single-token name -> no addressInfo (needs both first and last).
    expect(n.googleUserIdentifiers({ name: 'Madonna', zip: '43215' })).toEqual([]);
  });
});

describe('metaUserRecord', () => {
  it('aligns with schema and hashes all', () => {
    const cust = {
      email: 'test@example.com',
      phone_number: '(614) 555-0100',
      name: 'John Smith',
      zip: '43215',
    };
    const rec = n.metaUserRecord(cust);
    expect(rec.length).toBe(n.META_SCHEMA.length);
    expect(rec[0]).toBe(H_EMAIL);
    expect(rec[1]).toBe(H_PHONE);
    expect(rec[2]).toBe(H_FIRST);
    expect(rec[3]).toBe(H_LAST);
    expect(rec[4]).toBe(H_ZIP); // Meta DOES hash zip
    expect(rec[5]).toBe(n.sha256('us')); // ...and country
  });

  it('missing fields are empty strings', () => {
    const rec = n.metaUserRecord({ email: 'test@example.com' });
    expect(rec[0]).toBe(H_EMAIL);
    expect(rec[1]).toBe('');
    expect(rec[2]).toBe('');
    expect(rec[3]).toBe('');
    expect(rec[4]).toBe('');
    expect(rec[5]).toBe(n.sha256('us')); // country always defaults
  });
});

// --- coverage --------------------------------------------------------------

function sample(): n.PiiCustomer[] {
  return [
    { email: 'a@x.com', phone_number: '(614) 555-0001', name: 'Ann Lee', zip: '43215' },
    { email: 'b@x.com', phone_number: '', name: '', zip: '' }, // email only
    { email: '', phone_number: '6145550003', name: 'Cy Poe', zip: '43220' }, // phone + name/zip
    { email: '', phone_number: '', name: 'Madonna', zip: '43000' }, // single name -> no name/zip
    { email: '', phone_number: '', name: '', zip: '' }, // no identifier
  ];
}

describe('coverage', () => {
  it('counts', () => {
    const cov = n.coverage(sample());
    expect(cov.total).toBe(5);
    expect(cov.hasEmail).toBe(2);
    expect(cov.hasPhone).toBe(2);
    expect(cov.hasNameZip).toBe(2); // rows 1 and 3 (row 4 has single-token name)
    // rows 1,2,3 each have at least one usable identifier; row 4 (single-token name,
    // no email/phone) and row 5 (nothing) are not addressable.
    expect(cov.hasAnyIdentifier).toBe(3);
  });
});

// --- match-rate estimate ---------------------------------------------------

describe('estimateMatchRate', () => {
  it('within benchmark bounds and labeled', () => {
    const cov = n.coverage(sample());
    const est = n.estimateMatchRate(cov, 'google');
    const m = n.BENCHMARK_MULTIPLIERS.google;
    const loBound = Math.min(m.email[0], m.phone[0], m.name_zip[0]);
    const hiBound = Math.max(m.email[1], m.phone[1], m.name_zip[1]);
    // Blended rate stays within the multiplier envelope, applied to the addressable set.
    expect(est.lowCount).toBeGreaterThanOrEqual(0);
    expect(est.highCount).toBeGreaterThanOrEqual(est.lowCount);
    expect(cov.hasAnyIdentifier).toBeGreaterThanOrEqual(est.highCount);
    expect(est.lowCount).toBeGreaterThanOrEqual(loBound * cov.hasAnyIdentifier - 1);
    expect(est.highCount).toBeLessThanOrEqual(hiBound * cov.hasAnyIdentifier + 1);
    expect(est.disclaimer).toContain('NOT a Google');
  });

  it('zero coverage is zero', () => {
    const cov = n.coverage([{ email: '', phone_number: '', name: '', zip: '' }]);
    const est = n.estimateMatchRate(cov, 'meta');
    expect(est.lowCount).toBe(0);
    expect(est.highCount).toBe(0);
    expect(est.lowPct).toBe(0.0);
    expect(est.highPct).toBe(0.0);
  });

  it('unknown platform raises', () => {
    expect(() => n.estimateMatchRate(n.coverage(sample()), 'tiktok')).toThrow(ValidationError);
  });
});
