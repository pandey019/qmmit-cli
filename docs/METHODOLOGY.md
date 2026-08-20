# Methodology

## What is counted

Coding agents write signatures about themselves into commit metadata. Only
literal, deterministic matches are counted — every rule is in
[`../src/signatures.js`](../src/signatures.js).

| Agent | Signals |
|---|---|
| Claude Code | `Co-Authored-By: Claude`, "Generated with Claude Code", `claude[bot]` |
| Cursor | `Co-Authored-By: Cursor`, `cursoragent@cursor.com`, `cursor[bot]` |
| GitHub Copilot | `Co-Authored-By: Copilot`, `copilot-swe-agent[bot]` |
| Devin | `devin-ai-integration[bot]`, `Devin AI` |
| OpenAI Codex | `chatgpt.com/codex/` footer, `Co-Authored-By: Codex` |
| Aider | `(aider)` subject suffix |
| Gemini CLI | `Co-Authored-By: Gemini`, `gemini-code-assist[bot]` |

No heuristics. No style analysis. No perplexity scoring. Those do not work
reliably on code — formatters and linters erase the signal — and one confident
false positive would cost more than the feature is worth.

## The denominator

```
considered = all commits
           − merge commits        (no authored content)
           − CI/dependency bots   (machine-made, not agent-authored)
```

Bots are excluded by the `[bot]` **convention**, not a list of known names,
because every repository invents its own release bot. This matters more than it
sounds: some repositories are over 40% bot commits, and counting dependabot as
AI-written code produces a meaningless number.

**Agent detection runs before bot exclusion.** Several coding agents ship as
GitHub Apps and carry `[bot]` themselves — `claude[bot]`, `cursor[bot]`,
`devin-ai-integration[bot]`. Excluding first silently deletes the exact commits
the tool exists to count, and the resulting undercount looks plausible rather
than broken. There is a test for this.

## Floors, not estimates

Squash merges and rebases strip `Co-Authored-By` trailers, so real usage is
higher than reported. A floor built from literal string matches can only be
wrong in one direction. The JSON field is named `agentSharePctFloor` so it
cannot be rendered as an estimate downstream by accident.

## Assisted vs autonomous

A matched commit is one of two quite different things:

- **assisted** — a developer's identity authored the commit and the agent added
  itself as co-author. The agent ran `git commit` during a session, with a
  person there.
- **autonomous** — a bot identity is the commit author. No human in the loop.

Measured across 413 matched commits, roughly 94% are assisted. Reporting them
as a single number would be misleading, so they are reported separately.

## Concentration

A share alone is close to meaningless. 74% driven by one maintainer and 41%
spread across forty engineers are opposite facts. Every report includes:

- `distinctAgentAuthors` — how many people commit agent-signed work
- `topAuthorShareOfAgentCommits` — how much the largest one accounts for
- `adoptionPattern` — `none` / `individual` / `team` / `org-wide`

Thresholds for the pattern label are deliberate but arbitrary; the raw numbers
are always present so anyone can draw their own line.

## Time windows

**Use `--since`, not `--limit`, when comparing repositories.**

A commit-count window is not a time window. In the published index, the last 500
commits spanned 62 months for django and 2 months for supabase — so slow-moving
projects were measured across a period when agents barely existed. That produced
a 6.7x bias and reversed the ecosystem ranking entirely. See
[CORRECTIONS.md](CORRECTIONS.md).

## What this does not measure

**Code written with AI assistance that a human committed by hand.** Git records
who ran `git commit`, not who typed the code.

- Detected — the agent ran the commit (Claude Code and Cursor do this by
  default and sign it)
- Detected — a bot identity authored the commit outright
- Invisible — you wrote code with an agent and ran `git commit` yourself

A 0% result means nobody's tooling is signing commits. It does not mean no AI
was involved.

## Privacy

Counts and ratios only. No contributor is named in any output, ever. There is
no flag to enable it, including for local scans of your own repository. See
[CONTRIBUTING.md](../CONTRIBUTING.md) for the reasoning.
