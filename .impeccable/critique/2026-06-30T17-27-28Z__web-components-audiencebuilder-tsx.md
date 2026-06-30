---
target: web/components/AudienceBuilder.tsx
total_score: 25
p0_count: 1
p1_count: 2
timestamp: 2026-06-30T17-27-28Z
slug: web-components-audiencebuilder-tsx
---
# Critique — Eco Audience Builder (`web/components/AudienceBuilder.tsx`)

Method: dual-agent (A: design review · B: detector + evidence). Browser visualization unavailable (no screenshot tool exposed); review is source + deterministic scan only.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Live count + `.loading` dim + debounce work; count updates announced to no one (no `aria-live`), no skeleton. |
| 2 | Match System / Real World | 3 | Marketer language up front, but DB internals leak in footer (`edw2.customers`, "customer mart") + SQL tab. |
| 3 | User Control and Freedom | 2 | "Clear all" only; no undo, no per-section clear, loading a saved audience silently destroys unsaved work. |
| 4 | Consistency and Standards | 2 | Selection rendered as chips vs segs inconsistently; same navy primary does a free Save and a money Send. |
| 5 | Error Prevention | 2 | ZIP validates inline (good); Tag-apply and Ads-send fire on one click, no confirm, no 0-count guard. |
| 6 | Recognition Rather Than Recall | 3 | Live per-chip counts, active badges, mode hint. Collapsed sections hide which filters are set. |
| 7 | Flexibility and Efficiency | 3 | Saved audiences, presets, Enter-to-commit, column memory. No shortcuts, no bulk ops. |
| 8 | Aesthetic and Minimalist | 3 | Clean and on-brand; held back by the redundant 4-stat hero and a dense 3-idea footer. |
| 9 | Error Recovery | 2 | Raw `String(e)` shown to marketers in preview + panel notes; no recovery path. |
| 10 | Help and Documentation | 2 | Inline mode hint + dry-run badge, but no metric tooltips, no first-run onboarding. |
| **Total** | | **25/40** | **Acceptable — solid foundation, real gaps in the high-stakes-action cluster** |

## Anti-Patterns Verdict

**LLM assessment:** Not slop. The chrome would pass a Linear/Stripe sniff test — hairline structure, brand color as punctuation, one dark surface for SQL, disciplined type. Three real tells: (1) the **hero-metric template** — `StatsCharts` renders four identical `repeat(4,1fr)` `.stat` cards (globals.css:112), so the product's stated anchor (audience size) is just one of four equal 34px numbers; (2) a **reinvented, inaccessible popover** — the four card-actions are custom `position:fixed` `Dropdown`s with no dialog role/focus trap/return; (3) **inconsistent selection vocabulary** — chips (pill) vs segs (rounded-rect) don't encode multi- vs single-select behavior.

**Deterministic scan:** `detect.mjs` over `web/components` + `globals.css` → exit 2, **23 findings**, all in globals.css:
- **1 × layout-transition (warning):** `transition: width` on `.stat-bar` (line 120). Confirms A's note that this rule is also dead — declared but never rendered by `StatsCharts`.
- **10 × radius-outside-DESIGN.md (advisory):** 9px (×4: lines 17, 203, 220, 224), 8px (×2: 155, 175), plus 5px, 7px, 11px, 16px. Documented scale is 6/10/14/18px. Real drift; 9px is the documented primary-button exception in prose but not in the token scale.
- **12 × color-outside-DESIGN.md (advisory):** 6 SQL syntax-theme colors (159–164) — **false positives**, functional code-editor tokens on the Ink-Well block; 4 `rgba(15,23,33,.xx)` shadow tints (36, 177, 208×2) — legitimate but undocumented shadow tokens; **`#a4262c` ×2 (178, 219)** — the exclude/danger red, a genuine semantic color absent from DESIGN.md.

The detector confirms the dead/janky `transition: width` and surfaces token drift the LLM pass under-weighted. It cannot see any of the behavioral, a11y, or IA issues (it is CSS-static), which is where the real severity lives.

**Visual overlays:** None. No browser/screenshot tool was exposed this session, so no user-visible overlay was injected and live rendered behavior (real focus rings, contrast, popover positioning) was inferred from source, not observed.

## Overall Impression

This is a genuinely credible internal tool, not a template. The core loop — toggle a chip, watch the live count and per-chip counts react — is the best thing here and exactly the right heartbeat for an audience builder. What undermines it is a cluster around **terminal, high-stakes actions**: Save/Tag/Export/Send all live in dismiss-on-blur popovers, the money/write actions fire on a single click with no confirmation, and the whole keyboard surface has no visible focus. The single biggest opportunity: make the audience count *actually* anchor the page, and give the money actions the deliberate, reassuring container they deserve.

## What's Working

1. **Progressive disclosure is well-executed and on-strategy.** Default-collapsed sections, async-loaded tag universe that never blocks the page (AudienceBuilder.tsx:103–109), SQL behind a tab on the one dark surface. Tames real complexity (8 facets, huge tag list) without removing power.
2. **Live per-option counts make the audience tangible.** `facetCounts` overlays counts on every chip, with a debounce + sequence guard (AudienceBuilder.tsx:56–80) preventing stale flicker. Users see the consequence of a choice before committing — this is what makes it feel like an audience tool, not a form.
3. **Disciplined brand expression.** Work Sans confined to titles/numbers, brand color as punctuation, one dark surface. Reads as a trustworthy product, not a toy or a SQL console.

## Priority Issues

### [P0] High-stakes actions (Ads send, Tag write-back) have no confirmation, summary, or undo
- **Why it matters:** Pushing to Google Ads spends money; Tag writes to ServiceTitan (system of record). Both fire on a single click inside a `Dropdown` that dismisses on outside-click/scroll/Escape (Dropdown.tsx:34–44). No "about to push N customers," no 0-count guard, no undo. Demoing "one click blasts an audience to Google" to leadership is a risk.
- **Fix:** Two-step inline confirm — click Send → reveal "Upload **{audienceCount} customers** to Google Ads? {reachCount} have a usable identifier." with explicit Confirm/Cancel. Disable when `audienceCount === 0`. Move the real (non-dry-run) send into a non-dismissable modal/sheet. Keep the dry-run badge.
- **Suggested command:** `/impeccable harden`

### [P1] No visible focus indicator anywhere; one rule actively removes it
- **Why it matters:** The only focus rule is `input.fin:focus{outline:none}` (globals.css:103), substituting a 1px cyan border (~2.9:1 — below the 3:1 non-text minimum). Every other control (chips, segs, tabs, mode buttons, btn-*, tag-opt, accordion headers) has no `:focus-visible` at all, and there's no `prefers-reduced-motion` block. Fails WCAG 2.1 AA 2.4.7 and 1.4.11 across the keyboard surface.
- **Fix:** Global `:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}` (stronger ring on navy), restore a visible ring on `.fin`, add a `@media (prefers-reduced-motion: reduce)` block neutralizing the chip/chevron transitions and `transition:width`.
- **Suggested command:** `/impeccable audit`

### [P1] Custom Dropdown is not accessible (no dialog role, focus trap, or focus return)
- **Why it matters:** All four primary outputs (Save, Tag, Export, Send) live behind one `position:fixed` popover with no `role="dialog"`, no `aria-haspopup`/`aria-expanded` on the trigger, no focus move-in/trap/return. A keyboard/SR user can open Export but can't reliably operate it.
- **Fix:** Add `aria-haspopup="dialog"` + `aria-expanded` to triggers, `role="dialog"` + `aria-label` on the panel, move focus to the first field on open, trap Tab, restore focus to the trigger on close.
- **Suggested command:** `/impeccable harden`

### [P2] The product's anchor metric doesn't anchor — it's one of four identical cards
- **Why it matters:** Audience count, % of base, reachable, avg value render as four equal `.stat` cards (StatsCharts.tsx:25–31, globals.css:112). The brief names the live count *the* visual anchor; here it competes at the same 34px with three lesser metrics — and reads as the generic 4-stat hero template.
- **Fix:** Promote audience count to a single dominant display (56–64px Work Sans, spanning columns), demote the other three to a smaller supporting row, and wrap it in `aria-live="polite"` so it's announced on update.
- **Suggested command:** `/impeccable layout`

### [P2] Raw error strings shown to non-technical users
- **Why it matters:** `String(e)` surfaces directly in the preview empty state (PreviewTable.tsx:21 ← AudienceBuilder.tsx:71) and panel notes (SavePanel/AdsPanel/TagPanel). "TypeError: Failed to fetch" reads as user failure and offers no recovery — contradicts the non-technical positioning.
- **Fix:** Map errors to friendly copy with an action ("Couldn't update the audience — check your connection and try again."), log raw errors to console/telemetry.
- **Suggested command:** `/impeccable clarify`

## Persona Red Flags

**Sam (accessibility / keyboard / screen reader) — most exposed.** No focus visible on any control (only the outline-removing rule, globals.css:103). The four `Dropdown`s lack dialog semantics/focus management. The live audience count — the whole point — has no `aria-live`, so toggling a chip announces nothing. Collapsible section headers lack `aria-expanded`. (`aria-pressed` on chips and `aria-label` on table icons are done right.)

**Non-technical marketer demoing to leadership (project-specific) — second most exposed.** Cold open: 8 collapsed accordions, four em-dash stats, empty preview, no "start here." The money moment is unguarded — "Dry-run send" fires from a popover with no confirmation. DB internals leak in the footer + SQL tab.

**Alex (power user) — moderately exposed.** No keyboard shortcuts, no bulk-select, no per-section clear. Include/Exclude is a single hidden mode toggle — the same chips render identically in both modes, so it's easy to set a filter in the wrong mode. Loading a saved audience silently destroys current unsaved work (AudienceBuilder.tsx:141).

## Minor Observations

- `.stat-bar` (globals.css:120) — transition defined, element never rendered; dead CSS + the detector's only warning.
- Radius drift: 5/7/8/9/11/16px against a documented 6/10/14/18 scale (10 detector hits). Mostly harmless, but either adopt the values into DESIGN.md or snap to the scale.
- `#a4262c` exclude-red used in two places (globals.css:178, 219) but undocumented in DESIGN.md — promote it to a named semantic token.
- `.saved-name` (SavePanel.tsx:108) has no ellipsis; long names may wrap in the 320px panel.
- Footer crams base count + compliance-relevant suppression note + SQL-safety into one 11.5px paragraph (AudienceBuilder.tsx:278–290).
- `switchMode` clears `facetCounts` then refreshes (AudienceBuilder.tsx:129–134) — per-chip counts flicker to fallback on every include↔exclude switch.
- Export column picker (~21 checkboxes) has no select-all / reset-to-defaults.
- On a ~720px tablet the stats stay 4-across (only drop to 2-col at 680px) — cramped.

## Questions to Consider

1. Should the audience count *be* the page — a persistent oversized element that visibly moves with every chip toggle — rather than one card in a strip of four?
2. Is Include/Exclude a mode, or should it be per-filter (click = include, a small −/+ = exclude), removing the hidden-mode memory burden and the count-flicker on switch?
3. What's the right container for a money action? Split the four actions — reversible ones (Save/Export) stay dropdowns, write/spend ones (Tag/Send) become a deliberate, non-dismissable review step.
4. Could the empty/first-run state teach ("325K customers — narrow it down", with one suggested starting filter) instead of only appearing after a zero-result query?
