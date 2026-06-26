"""Pure helpers for ad-platform Customer Match / Custom Audience uploads.

No DB, no network — just the normalization + SHA-256 hashing each platform requires,
identifier-coverage counting, and a benchmark-based match-rate *estimate*. Kept
separate from app/ads.py (the I/O / mock-client seam) so this is trivially unit-
testable with known hash vectors.

Both Google Ads (Customer Match) and Meta (Custom Audiences) match users by uploading
SHA-256 hashes of *normalized* PII (email, phone in E.164, first/last name, zip,
country). The platforms only report a real match rate *after* an upload — see
estimate_match_rate for the honest, clearly-labeled offline approximation.
"""
from __future__ import annotations

import hashlib
import re

# Gmail-family domains get extra normalization under Google's spec (dots in the local
# part are ignored and a "+tag" suffix is stripped). Meta does not do this.
_GMAIL_DOMAINS = {"gmail.com", "googlemail.com"}


def sha256(s: str) -> str:
    """Hex SHA-256 of a UTF-8 string — the hash form both platforms expect."""
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


# ----------------------------------------------------------------- normalization
def norm_email(raw: str | None, *, gmail_rules: bool = False) -> str | None:
    """Trim + lowercase an email. With gmail_rules (Google only), strip dots and any
    '+tag' from the local part of gmail/googlemail addresses. Returns None if blank
    or obviously not an address."""
    if not raw:
        return None
    e = raw.strip().lower()
    if "@" not in e or e.startswith("@") or e.endswith("@"):
        return None
    if gmail_rules:
        local, _, domain = e.partition("@")
        if domain in _GMAIL_DOMAINS:
            local = local.split("+", 1)[0].replace(".", "")
            e = f"{local}@{domain}"
    return e


def norm_phone(raw: str | None, *, default_country: str = "US") -> str | None:
    """Normalize a phone to E.164 (e.g. '+16145550100'). Keeps digits only; a bare
    10-digit US number gets a '+1'; an 11-digit number starting with 1 is treated as
    US. Returns None if fewer than 10 digits remain (not a dialable number)."""
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    if default_country == "US":
        if len(digits) == 10:
            digits = "1" + digits
        if len(digits) == 11 and digits.startswith("1"):
            return "+" + digits
    if len(digits) < 10:
        return None
    return "+" + digits


def norm_name(raw: str | None) -> str | None:
    """Lowercase, trim, collapse internal whitespace, drop punctuation/digits."""
    if not raw:
        return None
    n = re.sub(r"[^a-z\s]", "", raw.strip().lower())
    n = re.sub(r"\s+", " ", n).strip()
    return n or None


def split_name(full: str | None) -> tuple[str | None, str | None]:
    """Best-effort (first, last) from the mart's single `name` column. First token is
    the first name, the remainder is the last name. Both None if unusable, and last is
    None when only one token is present (Google addressInfo needs both)."""
    n = norm_name(full)
    if not n:
        return None, None
    parts = n.split(" ")
    if len(parts) == 1:
        return parts[0], None
    return parts[0], " ".join(parts[1:])


def norm_zip(raw: str | None) -> str | None:
    """First 5 US digits of a postal code. None if absent."""
    if not raw:
        return None
    m = re.search(r"\d{5}", str(raw))
    return m.group(0) if m else None


def norm_country(raw: str | None) -> str:
    """2-letter ISO country, lowercase. Defaults to 'us' (Eco Plumbers is Ohio-based)."""
    if raw:
        c = re.sub(r"[^a-z]", "", str(raw).strip().lower())
        if len(c) == 2:
            return c
    return "us"


# ----------------------------------------------------- per-platform hashed records
def google_user_identifiers(cust: dict) -> list[dict]:
    """Build a Google Ads Customer Match UserIdentifier list for one customer.

    Mirrors the OfflineUserDataJob `userIdentifiers` shape: hashedEmail and
    hashedPhoneNumber are standalone identifiers; first/last name are hashed inside an
    addressInfo block where countryCode and postalCode are sent *unhashed* (per
    Google's spec). Only identifiers the customer actually has are emitted.
    """
    out: list[dict] = []
    email = norm_email(cust.get("email"), gmail_rules=True)
    if email:
        out.append({"hashedEmail": sha256(email)})
    phone = norm_phone(cust.get("phone_number"))
    if phone:
        out.append({"hashedPhoneNumber": sha256(phone)})
    first, last = split_name(cust.get("name"))
    zip_ = norm_zip(cust.get("zip"))
    if first and last and zip_:
        out.append({
            "addressInfo": {
                "hashedFirstName": sha256(first),
                "hashedLastName": sha256(last),
                "countryCode": norm_country(cust.get("country")).upper(),
                "postalCode": zip_,
            }
        })
    return out


def meta_user_record(cust: dict) -> list[str]:
    """Build a Meta Custom Audiences data row for the schema
    [EMAIL, PHONE, FN, LN, ZIP, COUNTRY]. Every present field is SHA-256 hashed (Meta
    normalizes then hashes all of these, including zip/country); missing fields are an
    empty string so the row still aligns with the fixed schema.
    """
    email = norm_email(cust.get("email"))
    phone = norm_phone(cust.get("phone_number"))
    first, last = split_name(cust.get("name"))
    zip_ = norm_zip(cust.get("zip"))
    country = norm_country(cust.get("country"))
    return [
        sha256(email) if email else "",
        sha256(phone) if phone else "",
        sha256(first) if first else "",
        sha256(last) if last else "",
        sha256(zip_) if zip_ else "",
        sha256(country),
    ]


META_SCHEMA = ["EMAIL", "PHONE", "FN", "LN", "ZIP", "COUNTRY"]


# ----------------------------------------------------------------------- coverage
def coverage(customers: list[dict]) -> dict:
    """Count how many customers carry each hashable identifier. `hasNameZip` requires
    a splittable first+last name AND a zip (the weakest signal). `hasAnyIdentifier` is
    the addressable set — anyone with at least one usable identifier."""
    total = len(customers)
    has_email = has_phone = has_name_zip = has_any = 0
    for c in customers:
        email = bool(norm_email(c.get("email")))
        phone = bool(norm_phone(c.get("phone_number")))
        first, last = split_name(c.get("name"))
        name_zip = bool(first and last and norm_zip(c.get("zip")))
        if email:
            has_email += 1
        if phone:
            has_phone += 1
        if name_zip:
            has_name_zip += 1
        if email or phone or name_zip:
            has_any += 1
    return {
        "total": total,
        "hasEmail": has_email,
        "hasPhone": has_phone,
        "hasNameZip": has_name_zip,
        "hasAnyIdentifier": has_any,
    }


# ---------------------------------------------------------- match-rate estimate
# Published industry benchmark ranges for how many *uploaded, valid* identifiers a
# platform typically matches to a real user — NOT a platform-reported rate. Email and
# phone match far better than name+zip alone. Tune freely; this is the single knob.
BENCHMARK_MULTIPLIERS = {
    "google": {"email": (0.60, 0.80), "phone": (0.55, 0.75), "name_zip": (0.40, 0.60)},
    "meta":   {"email": (0.55, 0.75), "phone": (0.50, 0.70), "name_zip": (0.35, 0.55)},
}

_DISCLAIMER = (
    "Estimate from published industry benchmarks — NOT a {platform}-reported match "
    "rate. The true rate is only known after a real upload."
)


def estimate_match_rate(cov: dict, platform: str) -> dict:
    """Predict a match-rate range for an audience from its identifier coverage.

    Method (transparent, prototype-grade): blend the per-identifier benchmark
    multipliers, weighted by how many customers carry each identifier, then apply that
    blended rate to the addressable set (hasAnyIdentifier). This is a coarse estimate,
    not a platform-reported number — see `disclaimer`.
    """
    mult = BENCHMARK_MULTIPLIERS.get(platform)
    if mult is None:
        raise ValueError(f"Unknown platform: {platform!r}")
    total = cov.get("total") or 0
    addressable = cov.get("hasAnyIdentifier") or 0
    weights = {
        "email": cov.get("hasEmail", 0),
        "phone": cov.get("hasPhone", 0),
        "name_zip": cov.get("hasNameZip", 0),
    }
    wsum = sum(weights.values())
    if wsum == 0 or addressable == 0:
        return {
            "lowPct": 0.0, "highPct": 0.0, "lowCount": 0, "highCount": 0,
            "basis": "no hashable identifiers in this audience",
            "disclaimer": _DISCLAIMER.format(platform=platform.title()),
        }
    blended_lo = sum(mult[k][0] * w for k, w in weights.items()) / wsum
    blended_hi = sum(mult[k][1] * w for k, w in weights.items()) / wsum
    low_count = round(addressable * blended_lo)
    high_count = round(addressable * blended_hi)
    pct = lambda c: round(c / total * 100, 1) if total else 0.0
    return {
        "lowPct": pct(low_count),
        "highPct": pct(high_count),
        "lowCount": low_count,
        "highCount": high_count,
        "basis": "identifier coverage × blended industry benchmark, on the addressable set",
        "disclaimer": _DISCLAIMER.format(platform=platform.title()),
    }
