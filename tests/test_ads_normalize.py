"""Tests for app.ads_normalize — PII normalization, SHA-256 hashing, identifier
coverage, and the benchmark match-rate estimate. Pure functions, no DB / network.

Hash vectors are pinned to known SHA-256 digests so a change in normalization (which
would silently break real-world match rates) fails loudly here.
"""
from __future__ import annotations

from app import ads_normalize as n

# Known SHA-256 hex digests (see the normalized plaintext in each test).
H_EMAIL = "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b"  # test@example.com
H_PHONE = "7bfdced8eeeb99072c4222ec538f87cbf05f24560482f616924d8fd4fa7be681"  # +16145550100
H_FIRST = "96d9632f363564cc3032521409cf22a852f2032eec099ed5967c0d000cec607a"  # john
H_LAST = "6627835f988e2c5e50533d491163072d3f4f41f5c8b04630150debb3722ca2dd"   # smith
H_ZIP = "57d8ea508719b6c5bde9434efaa517f3634119a4c5aa17d78e54f5f7218b6369"    # 43215


# --- normalization ---------------------------------------------------------

def test_email_trim_and_lowercase():
    assert n.norm_email("  Test@Example.com ") == "test@example.com"
    assert n.sha256(n.norm_email(" Test@Example.com ")) == H_EMAIL


def test_email_blank_or_invalid_is_none():
    assert n.norm_email("") is None
    assert n.norm_email(None) is None
    assert n.norm_email("not-an-email") is None


def test_email_gmail_rules_only_with_flag_and_gmail_domain():
    # Without the flag: dots/+tag preserved.
    assert n.norm_email("Jane.Doe+promo@gmail.com") == "jane.doe+promo@gmail.com"
    # With the flag: dots and +tag stripped, but only for gmail-family domains.
    assert n.norm_email("Jane.Doe+promo@gmail.com", gmail_rules=True) == "janedoe@gmail.com"
    assert n.norm_email("Jane.Doe+promo@example.com", gmail_rules=True) == "jane.doe+promo@example.com"


def test_phone_to_e164():
    assert n.norm_phone("(614) 555-0100") == "+16145550100"
    assert n.norm_phone("614-555-0100") == "+16145550100"
    assert n.norm_phone("16145550100") == "+16145550100"
    assert n.sha256(n.norm_phone("(614) 555-0100")) == H_PHONE


def test_phone_too_short_is_none():
    assert n.norm_phone("555-0100") is None
    assert n.norm_phone("") is None
    assert n.norm_phone(None) is None


def test_split_name():
    assert n.split_name("John Smith") == ("john", "smith")
    assert n.split_name("  JOHN   SMITH ") == ("john", "smith")
    assert n.split_name("Madonna") == ("madonna", None)  # single token -> no last name
    assert n.split_name(None) == (None, None)


def test_zip_and_country():
    assert n.norm_zip("43215-1234") == "43215"
    assert n.norm_zip("Columbus OH 43215") == "43215"
    assert n.norm_zip(None) is None
    assert n.norm_country(None) == "us"
    assert n.norm_country("US") == "us"


# --- per-platform record builders ------------------------------------------

def test_google_user_identifiers_shape_and_hashes():
    cust = {"email": "test@example.com", "phone_number": "(614) 555-0100",
            "name": "John Smith", "zip": "43215"}
    ids = n.google_user_identifiers(cust)
    assert {"hashedEmail": H_EMAIL} in ids
    assert {"hashedPhoneNumber": H_PHONE} in ids
    addr = next(i["addressInfo"] for i in ids if "addressInfo" in i)
    assert addr["hashedFirstName"] == H_FIRST
    assert addr["hashedLastName"] == H_LAST
    assert addr["countryCode"] == "US"      # country/zip are NOT hashed for Google
    assert addr["postalCode"] == "43215"


def test_google_skips_missing_identifiers():
    assert n.google_user_identifiers({"email": "", "phone_number": "", "name": "", "zip": ""}) == []
    # Single-token name -> no addressInfo (needs both first and last).
    ids = n.google_user_identifiers({"name": "Madonna", "zip": "43215"})
    assert ids == []


def test_meta_record_aligns_with_schema_and_hashes_all():
    cust = {"email": "test@example.com", "phone_number": "(614) 555-0100",
            "name": "John Smith", "zip": "43215"}
    rec = n.meta_user_record(cust)
    assert len(rec) == len(n.META_SCHEMA)
    assert rec[0] == H_EMAIL
    assert rec[1] == H_PHONE
    assert rec[2] == H_FIRST
    assert rec[3] == H_LAST
    assert rec[4] == H_ZIP                  # Meta DOES hash zip
    assert rec[5] == n.sha256("us")         # ...and country


def test_meta_missing_fields_are_empty_strings():
    rec = n.meta_user_record({"email": "test@example.com"})
    assert rec[0] == H_EMAIL
    assert rec[1] == "" and rec[2] == "" and rec[3] == "" and rec[4] == ""
    assert rec[5] == n.sha256("us")         # country always defaults


# --- coverage --------------------------------------------------------------

def _sample():
    return [
        {"email": "a@x.com", "phone_number": "(614) 555-0001", "name": "Ann Lee", "zip": "43215"},
        {"email": "b@x.com", "phone_number": "", "name": "", "zip": ""},          # email only
        {"email": "", "phone_number": "6145550003", "name": "Cy Poe", "zip": "43220"},  # phone + name/zip
        {"email": "", "phone_number": "", "name": "Madonna", "zip": "43000"},      # single name -> no name/zip
        {"email": "", "phone_number": "", "name": "", "zip": ""},                  # no identifier
    ]


def test_coverage_counts():
    cov = n.coverage(_sample())
    assert cov["total"] == 5
    assert cov["hasEmail"] == 2
    assert cov["hasPhone"] == 2
    assert cov["hasNameZip"] == 2          # rows 1 and 3 (row 4 has single-token name)
    # rows 1,2,3 each have at least one usable identifier; row 4 (single-token name,
    # no email/phone) and row 5 (nothing) are not addressable.
    assert cov["hasAnyIdentifier"] == 3


# --- match-rate estimate ---------------------------------------------------

def test_estimate_within_benchmark_bounds_and_labeled():
    cov = n.coverage(_sample())
    est = n.estimate_match_rate(cov, "google")
    m = n.BENCHMARK_MULTIPLIERS["google"]
    lo_bound = min(v[0] for v in m.values())
    hi_bound = max(v[1] for v in m.values())
    # Blended rate stays within the multiplier envelope, applied to the addressable set.
    assert 0 <= est["lowCount"] <= est["highCount"] <= cov["hasAnyIdentifier"]
    assert lo_bound * cov["hasAnyIdentifier"] - 1 <= est["lowCount"]
    assert est["highCount"] <= hi_bound * cov["hasAnyIdentifier"] + 1
    assert "NOT a Google" in est["disclaimer"]


def test_estimate_zero_coverage_is_zero():
    cov = n.coverage([{"email": "", "phone_number": "", "name": "", "zip": ""}])
    est = n.estimate_match_rate(cov, "meta")
    assert est["lowCount"] == 0 and est["highCount"] == 0
    assert est["lowPct"] == 0.0 and est["highPct"] == 0.0


def test_estimate_unknown_platform_raises():
    import pytest
    with pytest.raises(ValueError):
        n.estimate_match_rate(n.coverage(_sample()), "tiktok")
