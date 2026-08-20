# CORRECTIONS.md — pre-publication audit

**Date:** 2026-08-15
**Status:** two material flaws found. Do not publish current numbers or copy until both are fixed.

This document exists because the whole value of this project is that its methodology survives scrutiny. Both issues below would have been found by a competent critic within an hour of launch.

---

## Flaw 1 — "last 500 commits" is not a time window

**What was wrong.** Every repository was measured over its most recent 500 commits. That is a different time period for every project:

| Repo | Span of its last 500 commits |
|---|---|
| django/django | 62 months |
| golang/go | 52 months |
| supabase/supabase | 2 months |
| vercel/next.js | 2 months |

Slow-moving repositories were therefore measured largely over a period when coding agents barely existed, dragging their share toward zero for reasons that have nothing to do with adoption.

**Magnitude of the bias:**

| Window length | Repos | Mean share |
|---|---|---|
| ≥18 months | 34 | 1.9% |
| ≤6 months | 66 | 12.7% |

A 6.7x difference driven purely by commit velocity.

**Effect on published claims.** Recomputed over a fixed Feb–Aug 2026 window:

| Metric | Old (500 commits) | Fixed window |
|---|---|---|
| Aggregate | 8.4% | **11.0%** |
| Median | 2.8% | **4.0%** |

Individual repos move drastically — `denoland/fresh` goes from 12.1% to **54.1%**.

**The ecosystem claim reverses.** Data/viz was reported last at 0.1%; on a fixed window it is *first* at 12.5%. The "45x ecosystem gap" headline was substantially measuring commit velocity, not agent adoption.

**Fix:** re-run every repository with `--since 2026-02-01` so all are measured over the same calendar period. Exclude any repo with fewer than 100 commits in that window as too noisy. Concentration must be recomputed on the same window — mismatched denominators between share and concentration are exactly what a critic looks for.

---

## Flaw 2 — "autonomous" is wrong for 96% of the data

**What was wrong.** The site describes the metric as commits made by agents "with no human in the commit loop." Inspection of 413 matched commits across three repositories:

| Category | Count | Share |
|---|---|---|
| Human author + agent co-author trailer | 396 | **95.9%** |
| Bot identity as the commit author | 17 | 4.1% |

Typical matched commit: author `Rafael Miller <...>`, body contains `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. A human's identity, with the agent recorded as co-author because **Claude Code ran `git commit` and signed it**.

Only the small minority — `devin-ai-integration[bot]`, `claude[bot]`, `cursor[bot]` as author — are genuinely autonomous.

**Fix — reframe, and split the metric in two.** What is actually measured is *the agent performed the commit*. Report two tiers:

- **agent-assisted** — human identity, agent trailer. The agent ran the commit during a working session.
- **agent-autonomous** — bot identity as author. No human in the loop.

Both are real and the split is itself interesting. Reporting them as one number is not defensible.

**Consequence for existing copy.** An earlier claim in `CONTEXT.md` and on the site — that a developer using Claude Code leaves no trace in git — is wrong. Accurate version: it is detectable when the *agent* runs `git commit` (Claude Code does by default), invisible when the *developer* runs it manually. A 0% result means manual committing, not absence of AI assistance.

---

## What survives unchanged

**The concentration finding.** Whether a repository's agent commits come from one maintainer or forty is independent of both flaws. 42 repositories driven by a single person, median top contributor at 92%. pandas at 74.8% is one maintainer; cal.com at 41.2% is 41 people. This remains the strongest and most novel claim in the project.

**Systems languages lag.** Rust 1.0%, Go 0.6%, Python 1.4% against 9–12% for web tooling on the fixed window. The gap is real, just smaller and differently ordered than first reported.

**Signature precision.** Manual inspection of matched commits found no false positives. Evidence is unambiguous literal trailers and bot identities.

---

## Required before publishing

- [ ] Re-run all repositories with `--since 2026-02-01`
- [ ] Recompute concentration on the same window
- [ ] Drop repositories with <100 commits in the window
- [ ] Add the assisted / autonomous split to the engine output
- [ ] Rewrite all copy: remove "autonomous" and "no human in the commit loop" as blanket descriptions
- [ ] Recompute and restate the ecosystem comparison — the current ordering is wrong
- [ ] Restate the aggregate and median figures
- [ ] State the measurement window prominently on every figure

## Standing rule added

Any comparison across repositories must hold the time window constant. Any metric derived from commit counts must state its window. A number without a window is not a finding.
