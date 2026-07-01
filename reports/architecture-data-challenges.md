# Eco Audience Builder — Architecture & Data Challenges Overcome

*Prepared for leadership, July 2026*

The Audience Builder lets marketing carve a targeted customer list out of the full ~325K-customer warehouse, see the size and makeup instantly, and export it — safely and accurately. Getting to that point involved solving several real technical and data problems. Below is a plain-language summary of the biggest ones and how each was resolved.

## 1. Rebuilding the app on a stronger foundation

The original version was a lightweight prototype (Python/Flask with a simple webpage). As the tool took on more responsibility — ad exports, saved audiences, tagging — the team undertook a full rewrite onto a more modern, maintainable stack (Next.js/TypeScript). This is a significant undertaking: essentially rebuilding a working product without disrupting the people using it.

The first attempt at migrating one piece (the SQL preview panel) shipped with problems and had to be reverted. Rather than patch around it, the team broke the rewrite into small, independently verified pieces, rebuilt it methodically, and only cut the whole application over to the new version once every piece was tested and proven equivalent to the original. The old app was kept running as the source of truth the entire time, so there was no window where marketing was left without a working tool.

## 2. Making sure the "quick preview" never lies

For speed, the app keeps a full copy of the customer data in memory and filters it instantly as marketing adjusts criteria — rather than hitting the database on every click. The risk with this approach is that the fast in-memory version and the "official" database query could quietly drift apart and start giving different answers for the same filters, which would undermine trust in the tool.

To prevent this, the team built the two filtering paths from shared logic and added an automated test suite specifically designed to catch any disagreement between the fast preview and the real database query. This parity check now runs continuously, so any future change that would cause the two to diverge is caught before it ships.

## 3. Guaranteeing opted-out customers are never contacted

Some customers have asked not to be mailed, texted, or serviced. Early on, this was handled as an optional filter a user could turn on or off — which meant it was possible to accidentally build or export an audience that included people who had opted out.

This was redesigned so suppression of opted-out customers is now a permanent, invisible baseline: it happens automatically the moment data loads, before any filter is even applied, and it cannot be turned off or bypassed in previews, exports, or ad audiences. The team also had to account for the fact that not every version of the underlying warehouse has all the relevant opt-out fields yet (the data warehouse itself is still being migrated) — so the app checks what's actually available and adapts, rather than breaking or silently ignoring the safeguard.

## 4. Cleaning up messy source data

The warehouse doesn't provide some things in ready-to-use form. ZIP code, for example, isn't its own field — it has to be parsed out of a free-text address line, which works correctly about 99.5% of the time but not always. More broadly, the underlying data warehouse has business terms (like "completed," "sold," or "converted") that can mean different things depending on which report or table you're looking at, and using the wrong definition produces a plausible-looking but wrong answer.

To manage this, the team built a dedicated reference guide (a "querying playbook") documenting the warehouse's specific quirks, safe default definitions, and known trouble spots. This turns tribal knowledge into a documented standard so future work — by any engineer or by AI-assisted tooling — starts from the same correct assumptions instead of re-discovering the same pitfalls.

## 5. A silent data-corruption risk with customer ID numbers

Customer ID numbers in the warehouse can be larger than what JavaScript (the language the new web app runs on) handles precisely by default — past a certain size, it can silently round numbers, which would have meant occasionally exporting or matching the *wrong customer* without any error being thrown. This is the kind of bug that doesn't announce itself; it just quietly produces bad data.

The team caught this during review and switched the underlying storage to a numeric format that safely handles every real customer ID exactly, closing the gap before it ever reached production.

## 6. A security and reliability hardening pass

A dedicated review pass found and fixed several risks before they could cause harm: a gap that could have allowed more than one database command to run per request (closed by strictly enforcing single, read-only queries), a spreadsheet-export weakness that could let malicious text in the data execute as a formula when opened in Excel (neutralized), and a case where the marketing filter options in the app and the values actually loaded into memory could quietly fall out of sync, producing confusing errors. That last issue was fixed by having both sides pull from one single, shared source of truth instead of two separately maintained lists. Test coverage was expanded significantly during this pass (from 69 to 160 automated checks) to keep these classes of bugs from coming back.

## 7. A deliberate, documented scaling trade-off

Holding the full customer dataset in memory is what makes the tool feel instant, but it only works correctly if the application runs as a single process — running multiple copies would each hold and separately refresh their own version of the data, risking inconsistent answers depending on which copy answered your request. Rather than leave this as an invisible landmine, the team documented the constraint explicitly in the deployment instructions and identified the specific upgrade path (moving the shared data to an external store like Redis) that would be needed if the customer list grows enough, or usage grows enough, to require multiple servers.

---

**Bottom line:** most of these were not visible, feature-level bugs — they were foundational risks (data accuracy, compliance, silent corruption, security) caught and closed through deliberate engineering discipline: automated parity testing, a full-coverage bug sweep, and documentation of the assumptions and trade-offs baked into the system.
