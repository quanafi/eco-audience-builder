---
name: Eco Audience Builder
description: A field guide to the Eco Plumbers customer base — refined, legible, exploration-first.
colors:
  harbor-navy: "#003057"
  signal-blue: "#0057B8"
  bright-cyan: "#009FDF"
  field-green: "#00843D"
  lime: "#84BD00"
  paper: "#F7F9FB"
  white: "#FFFFFF"
  line: "#E4E9EF"
  line-strong: "#D6DCE3"
  mist: "#ECEFF2"
  silver: "#B3BBC4"
  slate: "#6B7480"
  graphite: "#3C4755"
  ink-well: "#0C1A28"
typography:
  display:
    fontFamily: "Work Sans, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "normal"
  headline:
    fontFamily: "Work Sans, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.005em"
  title:
    fontFamily: "Work Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.05em"
  body:
    fontFamily: "Open Sans, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "Open Sans, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.08em"
  mono:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "18px"
  pill: "999px"
spacing:
  xs: "7px"
  sm: "9px"
  md: "14px"
  lg: "20px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.harbor-navy}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.white}"
  button-ghost:
    backgroundColor: "{colors.white}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.md}"
    padding: "7px 14px"
  button-ghost-hover:
    textColor: "{colors.harbor-navy}"
  chip:
    backgroundColor: "{colors.white}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  chip-on:
    backgroundColor: "{colors.harbor-navy}"
    textColor: "{colors.white}"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.harbor-navy}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  panel:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.xl}"
    padding: "18px 20px"
  stat:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.lg}"
    padding: "18px 20px"
---

# Design System: Eco Audience Builder

## 1. Overview

**Creative North Star: "The Field Guide"**

The Eco customer base is a population of ~325,000 people, and this tool is the
guide to it. A field guide is approachable and legible by design: a non-expert
opens it and immediately knows how to read an entry, narrow to a region, and find
what they're after. That is the governing posture here. The marketer is not
writing a query against a warehouse; they are leafing through a well-organized
reference, watching the population resize as they refine, learning the customers
as they go. The generated SQL is the appendix at the back — present for trust and
hand-off, never the front door.

The system is **refined and restrained**. Surfaces are paper-white, structure is
carried by hairline rules and generous whitespace rather than heavy chrome, and
the Eco brand color appears as deliberate punctuation — a selected chip, a focus
ring, a live count — not as decoration spread across every surface. The one
moment of weight is the audience-size readout: it is the largest type on the
page and the thing the eye returns to as filters change. Everything else gets out
of its way.

This system explicitly rejects two things. It is **not a scary SQL/DBA console**:
no dark IDE chrome on the primary surface, no warehouse jargon in the controls, no
query editor as the landing view. And it is **not a toy**: no oversized rounding,
no playful color splashes, no emoji-as-UI. It handles real customer PII and ad
budgets, so it stays credible enough to project for leadership.

**Key Characteristics:**
- Paper-white canvas, hairline structure, brand color as punctuation.
- The live audience count is the visual anchor of every screen.
- Plain marketing language up front; SQL tucked one tab away.
- Refined over decorative — restraint is the house style.
- Holds up under a demo: clean hierarchy, unmistakable Eco identity.

## 2. Colors

A cool, professional palette anchored in Eco Plumbers' brand: a deep navy for
trust and text, a bright cyan for interactive energy, and green/lime as the
"safe and ready" signal colors. Neutrals are faintly cool, never warm.

### Primary
- **Harbor Navy** (`#003057`): The brand's anchor. Carries all primary text, the
  sticky header, and every *selected* state (active chips, segments, the primary
  download button). When something is "on" or committed, it turns navy.

### Secondary
- **Bright Cyan** (`#009FDF`): The interactive accent. Focus borders on inputs,
  the active tab underline, hover cues on ghost buttons, and the filter icon
  circles. Cyan means "this responds to you."
- **Signal Blue** (`#0057B8`): The link and motion color — customer links on
  hover, the primary button's hover fill. A half-step warmer/deeper than cyan.

### Tertiary
- **Field Green** (`#00843D`): The "read-only / SELECT-safe" signal. Used on the
  SQL tag that reassures the SQL is non-destructive.
- **Lime** (`#84BD00`): The "active / live" highlight — the active-filter badge,
  the ads-mode tag, status dots. Always paired with a dark text color for
  contrast; never carries text itself.

### Neutral
- **Paper** (`#F7F9FB`): The body background and table row-hover fill. The canvas.
- **White** (`#FFFFFF`): All raised surfaces — panels, stat tiles, popovers.
- **Line** (`#E4E9EF`) / **Line-Strong** (`#D6DCE3`): Hairline dividers and
  control borders. Line for section rules; Line-Strong for input/chip outlines.
- **Mist** (`#ECEFF2`): Subtle fills — segmented-toggle tracks, default tag chips.
- **Slate** (`#6B7480`): Muted text — labels, captions, secondary metadata.
- **Graphite** (`#3C4755`): Secondary body text and unselected chip text.
- **Ink-Well** (`#0C1A28`): The single dark surface — the SQL code block only.

### Named Rules
**The Punctuation Rule.** Brand color is punctuation, not paint. On any given
screen the saturated brand hues (navy fills, cyan, green, lime) should read as a
handful of deliberate marks against paper-white — selected state, focus, the live
count, a status badge — never as large color fields. If a surface feels colorful,
it's wrong.

**The One Dark Surface Rule.** Ink-Well (`#0C1A28`) appears in exactly one place:
the SQL code block. Dark chrome anywhere else reads as "scary console" and is
forbidden.

**The Contrast Floor.** Slate (`#6B7480`) on Paper/White sits near the AA edge;
use it only for genuinely secondary small text. For anything a user must read to
make a decision, step up to Graphite (`#3C4755`) or Harbor Navy. Never push muted
text lighter than Slate "for elegance."

## 3. Typography

**Display Font:** Work Sans (with `sans-serif` fallback)
**Body Font:** Open Sans (with `-apple-system, Segoe UI, Roboto, sans-serif`)
**Mono Font:** `ui-monospace, SF Mono, Menlo, Consolas` (SQL block only)

**Character:** Two humanist-adjacent sans-serifs paired on a weight-and-role axis,
not a style clash. Work Sans is the structural, slightly geometric voice for
numbers, headers, and labels; Open Sans is the warm, highly legible workhorse for
all running text. The pairing reads modern and quietly confident — a reference
book set in a clean grotesque, not a marketing page.

### Hierarchy
- **Display** (Work Sans 800, 34px, line-height 1): The audience-size readout and
  stat numbers only. The single largest type on the page; the visual anchor.
- **Headline** (Work Sans 700, 16px): The app title in the header.
- **Title** (Work Sans 700, 13px, letter-spacing 0.05em, often uppercase): Panel
  and section headers ("FILTERS"), tab labels, the export-panel title.
- **Body** (Open Sans 400, 14px, line-height 1.45): All running text, table
  cells, hints, descriptions. Cap measured prose at 65–75ch.
- **Label** (Open Sans 700, ~11px, letter-spacing 0.08em, uppercase): Sub-labels,
  table column heads, stat captions, button text on ghost/primary buttons.

### Named Rules
**The Number-Leads Rule.** Work Sans 800 at 34px is reserved for counts (audience
size, stat values). Nothing else gets that weight or scale. The number always wins
the hierarchy contest.

**The Uppercase-Label Ceiling.** Uppercase + wide tracking is for *labels and
section furniture only* — never for body copy, hints, or anything sentence-length.
It already runs close to its budget across labels, tabs, and buttons; do not
extend it to new surfaces.

## 4. Elevation

The system is **flat by default with one soft layer of lift**. Surfaces sit on the
paper canvas separated primarily by hairline borders (`#E4E9EF`) and whitespace,
not shadow. The single ambient shadow is reserved for the main content panels;
true depth only appears on genuinely floating elements (popovers/dropdowns), which
get a deeper shadow because they overlap content and need to read as "above."

### Shadow Vocabulary
- **Resting panel** (`box-shadow: 0 1px 2px rgba(15,23,33,.04), 0 14px 30px -20px rgba(15,23,33,.28)`):
  The main `.panel` lift. A near-invisible contact shadow plus a soft, wide,
  upward-biased ambient shadow. Calm, not dramatic.
- **Floating popover** (`box-shadow: 0 8px 18px rgba(15,23,33,.10), 0 24px 48px -24px rgba(15,23,33,.4)`):
  Export / save / ads panels and dropdowns. Deeper because they overlap.
- **Selected-toggle chip** (`box-shadow: 0 1px 2px rgba(15,23,33,.12)`): The tiny
  lift on the active segment of a segmented toggle.

### Named Rules
**The Flat-By-Default Rule.** Stat tiles, inputs, chips, table rows, and segments
are flat at rest — border and fill only. Shadow is earned by floating above other
content, not handed out for emphasis. If a resting card has a drop shadow heavier
than the panel ambient, it's too much.

## 5. Components

### Buttons
- **Shape:** Gently rounded (`10px`) for actions; the primary download button uses
  a slightly tighter `9px`. No pill-shaped buttons.
- **Primary:** Harbor Navy fill, white text, uppercase label (Open Sans 700,
  letter-spacing 0.04em), padding ~8px 16px. Hover deepens to Signal Blue.
- **Ghost / Secondary** (clear, copy, export, ghost): White fill, Line-Strong
  border, Slate or Graphite uppercase label. Hover shifts border to Bright Cyan
  and text to Harbor Navy. This is the default button — restraint means most
  actions are ghosts, with at most one navy primary per panel.
- **Disabled:** opacity 0.6, cursor default.

### Chips
- **Style:** Pill (`999px`), white fill, Line-Strong border, Graphite text,
  Open Sans 600 at 12px. Optional dim count suffix.
- **State:** Selected = Harbor Navy fill + white text + navy border. Used for
  multi-select filters (trades, regions, flags). Removable chips add a faint ✕.

### Segments
- **Style:** Rounded rectangle (`10px`), white fill, Line-Strong border, Graphite
  text. Selected = Harbor Navy fill + white text. Used for single-pick segment
  filters (spend / frequency / recency tiers). Flex-wrap, min-width ~62px.

### Inputs / Fields
- **Style:** White fill, Line-Strong border, `10px` radius, 13px Open Sans, Navy
  text. Full-width within their group.
- **Focus:** Border shifts to Bright Cyan, no glow, outline removed. The cyan
  border is the focus affordance — keep it; it carries keyboard accessibility.

### Cards / Containers
- **Corner Style:** Panels `18px`; stat tiles `14–16px`.
- **Background:** White on the Paper canvas.
- **Shadow Strategy:** Resting-panel ambient only (see Elevation). Stat tiles are
  flat with a 1px Line border.
- **Internal Padding:** ~18–20px.

### Navigation / Header
- **Style:** Full-width Harbor Navy bar, sticky, with a faint radial dot texture
  and a thin brand gradient strip beneath (blue → cyan → green → lime). White
  title (Work Sans 700) + uppercase Slate-on-navy subtitle. The gradient strip is
  the *only* sanctioned gradient in the system.

### Tabs
- **Style:** Underline tabs. Uppercase Title text, Slate at rest, Harbor Navy when
  active with a 3px Bright Cyan bottom border. No pill or boxed tabs.

### Tables (Signature)
- **Style:** Sticky uppercase Slate column heads on white, hairline `#ECEFF2` row
  dividers, Paper hover fill, tabular-nums on numeric columns. This is where the
  audience is *previewed* — it must stay scannable and quiet, never zebra-striped
  or boxed.

### Live Count / Stats (Signature)
- **Style:** A row of flat white tiles; each shows a Work Sans 800 number (Navy),
  an uppercase Slate caption with a small colored status dot, and a thin colored
  progress bar pinned to the bottom edge. The audience-size tile is the anchor of
  the whole UI.

## 6. Do's and Don'ts

### Do:
- **Do** make the audience-size count the largest, most prominent element on any
  screen (Work Sans 800, 34px, Harbor Navy). The number is the heartbeat.
- **Do** use Harbor Navy for selected/committed states and Bright Cyan for focus
  and hover — consistently, so "navy = chosen, cyan = responding" is learnable.
- **Do** keep brand color to deliberate punctuation against paper-white (The
  Punctuation Rule).
- **Do** default to ghost buttons; allow at most one navy primary action per panel.
- **Do** keep tables flat and quiet: hairline dividers, Paper hover, tabular-nums.
- **Do** step muted text up to Graphite (`#3C4755`) or Navy whenever a user must
  read it to make a decision; reserve Slate for genuinely secondary small text.
- **Do** preserve the cyan focus border on inputs and add visible focus on every
  interactive control (WCAG AA, keyboard nav).

### Don't:
- **Don't** make this look like a scary SQL/DBA console: no dark IDE chrome on the
  primary surface, no query editor as the landing view, no warehouse jargon
  (columns, joins, table names) in the controls. SQL lives behind a tab, on the
  one dark surface (Ink-Well), and nowhere else.
- **Don't** make it feel like a toy/consumer app: no oversized rounding beyond the
  `18px` panel, no playful color splashes, no emoji used as UI.
- **Don't** drift toward a generic gradient-card SaaS dashboard — the only
  gradient in the system is the 6px brand strip under the header.
- **Don't** spread saturated brand color across large surfaces; if a screen reads
  as "colorful," the Punctuation Rule has been broken.
- **Don't** add a second dark surface beyond the SQL block.
- **Don't** push muted body text lighter than Slate for "elegance" — it fails the
  contrast floor.
- **Don't** extend uppercase + wide tracking to body copy or sentence-length text;
  it's for labels and section furniture only.
- **Don't** give resting cards a drop shadow heavier than the panel ambient;
  surfaces are flat by default.
