# Product

## Register

product

## Users

Eco Plumbers' **marketing team** — non-technical people who think in *audiences*
("repeat HVAC customers in Columbus who haven't booked in 6 months"), not in SQL.
They sit in front of this to build, size, and act on customer segments drawn from
the live warehouse (`edw2.customers`, ~325K customers). The generated SQL is a
**hand-off artifact** they copy and pass along — not something they read or write.
Their working context is exploratory: they refine filters, watch the size and
preview react, and learn the customer base as they go. Sessions are also
**demoed to leadership/stakeholders**, so the tool has to look credible under
that gaze, not just functional.

## Product Purpose

Let marketing build any customer audience they want from *all* Eco Plumbers
customers, see its size update in real time, preview the matching customers, and
get it out the door — copy the read-only SQL, export, save it, or push it to
Google Ads / Meta customer-match. Every query is SELECT-only; the tool exists to
*contact* people, so opted-out customers are excluded before anything is shown.

Success looks like a marketer **exploring and refining freely** — chasing a
hypothesis through filter changes without fear of breaking anything — and walking
away confident the audience they built is real and ready to use.

## Brand Personality

**Fast, modern, effortless.** Voice is plain-spoken and audience-centric, never
database-centric: it speaks in customers, trades, and regions, not columns and
joins. Interactions should feel light and immediate — filters respond instantly,
counts animate, nothing blocks. The tone reassures a non-technical user that the
tool is doing the hard part for them. It carries the Eco Plumbers identity (the
navy → cyan → lime brand) so it reads as *ours*, not as a generic template.

## Anti-references

- **A scary SQL/DBA console.** No query-editor-first layout, no dark-IDE vibes, no
  warehouse jargon in the primary UI. SQL is available on demand as a hand-off,
  tucked behind a tab — never the front door.
- **A toy / consumer app.** No over-rounded, playful, emoji-heavy styling. This
  handles real customer PII and ad budgets; it must feel trustworthy and
  professional, not casual.
- (Watch also: the generic gradient-card SaaS dashboard, and Salesforce-style
  enterprise clutter — neither fits a fast, focused, single-purpose tool.)

## Design Principles

1. **Audiences, not queries.** Every primary surface speaks the marketer's
   language. Warehouse mechanics (SQL, columns, parity) stay one deliberate step
   away — present for trust and hand-off, never the default view.
2. **The number is the anchor.** Audience size is the heartbeat of the tool; it
   updates live and visibly as filters change, so refinement always has immediate,
   legible feedback.
3. **Safe to explore.** Nothing is destructive, everything is reversible, and the
   UI makes that obvious — a marketer should feel free to poke at any filter
   knowing they can't break or send anything by accident.
4. **Effortless over powerful-looking.** When density and ease conflict, favor
   ease. Hide complexity until it's asked for rather than displaying capability.
5. **Credible under a demo.** It must hold up when projected for leadership: clean
   hierarchy, real Eco identity, no template tells. Polished, not flashy.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**: ≥4.5:1 contrast on body text (≥3:1 on large/bold),
visible keyboard focus on every interactive control, full keyboard navigation of
filters/tabs/panels, and a `prefers-reduced-motion` alternative for the live
count and reveal animations. No formal compliance mandate, but AA is the floor for
an internal tool that handles real data.
