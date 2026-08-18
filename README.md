# qmmit-cli

Measure how much of a git repository is committed by AI coding agents.

```bash
npx qmmit-cli
```

Runs entirely on your machine. Works on private repositories, because nothing is uploaded anywhere.

Powers the public index at **[qmmit.dev](https://qmmit.dev)**.

---

## What it measures

Coding agents sign their own commits. Claude Code writes `Co-Authored-By: Claude`. Cursor commits as `cursor[bot]`. Devin as `devin-ai-integration[bot]`. Codex adds a task footer. Aider appends `(aider)` to the subject.

This counts those signatures, excludes CI bots, and reports the share as a **floor**.

```
  qmmit-cli  ·  agent-authorship report

  22.1% of commits are provably agent-authored (floor)
  ██████░░░░░░░░░░░░░░░░░░░░░░

  924 commits considered  ·  204 agent  ·  720 human
  excluded: 116 merges, 191 CI/dependency bots

  Adoption pattern: org-wide  (broad adoption)
    19 distinct contributors  ·  top one accounts for 20.3% of agent commits
```

## What it does *not* measure

**Code written with AI help that a human committed by hand.** Git records who ran `git commit`, not who typed the code.

In practice this splits three ways:

- **Detected** — the agent ran the commit. Claude Code and Cursor do this by default and sign it.
- **Detected** — a bot identity authored the commit outright (Devin, `claude[bot]`).
- **Invisible** — you wrote code with an agent and then ran `git commit` yourself in a terminal.

A 0% result means nobody's tooling is signing commits. It does not mean no AI was involved. That distinction is the whole reason the numbers are reported as a floor.

Measured across 413 matched commits, roughly **94% are assisted** (human identity, agent co-author) and 6% fully autonomous (bot identity as author). These are different things and the tool reports them separately.

## Usage

```bash
qmmit-cli                              # the repo you're standing in
qmmit-cli ~/work/internal-api          # any local clone, including private
qmmit-cli owner/repo                   # clone + scan a public GitHub repo
qmmit-cli https://git.example.com/x    # any git remote

qmmit-cli --since 2026-02-01           # fixed time window
qmmit-cli --limit 500                  # most recent N commits
qmmit-cli --json                       # machine readable
```

**Use `--since`, not `--limit`, when comparing repositories.** A commit-count window spans years for a slow project and weeks for a fast one — comparing on last-500-commits measures commit velocity as much as agent adoption. This is not a hypothetical: it produced a 6.7x bias in our own first dataset and reversed the ecosystem ranking.

## How it reads history

A blobless clone — commit metadata only, no file contents, no working tree:

```
git clone --filter=blob:none --no-checkout <url>
```

No GitHub API, so no rate limits and no token. A 9,000-commit repository takes about six seconds.

## Methodology

**Signals** are deterministic string matches only — literal trailers, footers and bot identities that agent tools write about themselves. No heuristics, no style analysis, no perplexity scoring. All of them are in [`signatures.js`](signatures.js), which is written to be read by skeptics.

**Exclusions.** CI, dependency and release bots are removed from the denominator by the `[bot]` naming convention rather than a list of known names — every repository has its own release bot. This matters more than it sounds: some repositories are over 40% bot commits, and counting dependabot as AI-written code produces a meaningless number.

**Order is load-bearing.** Agent detection runs *before* bot exclusion, because several coding agents ship as GitHub Apps and carry `[bot]` themselves — `claude[bot]`, `cursor[bot]`, `devin-ai-integration[bot]`. Excluding first would silently delete the exact commits we exist to count.

**Floors, not estimates.** Squash merges and rebases strip `Co-Authored-By` trailers, so real usage is higher than reported. A floor from literal string matches can only be wrong in one direction.

**Concentration is reported alongside every share**, because the percentage alone is close to meaningless. 74% driven by one maintainer and 41% spread across forty engineers are opposite facts. The tool classifies each repository as `individual`, `team`, or `org-wide`.

## What it will not do

**It reports counts, never names.** You get how many contributors commit agent-signed work and how concentrated that is — never who they are.

This is deliberate and permanent. A per-person breakdown of AI usage is a surveillance artifact: the information is already in `git log`, but a tool that packages it into a ranked report removes the effort that currently stops people from acting on it. That report ends up in front of someone's manager.

There is no flag to turn this off.

## JSON output

```json
{
  "agentSharePctFloor": 22.1,
  "mode": { "assistedCommits": 128, "autonomousCommits": 76,
            "assistedPct": 13.9, "autonomousPct": 8.2 },
  "concentration": { "distinctAgentAuthors": 19,
                     "topAuthorShareOfAgentCommits": 20.3,
                     "adoptionPattern": "org-wide" },
  "totals": { "commitsConsidered": 924, "agentAttributedCommits": 204,
              "ciBotCommitsExcluded": 191, "mergeCommitsExcluded": 116 },
  "timeline": [ { "month": "2026-02", "total": 140, "agent": 21, "agentPct": 15 } ],
  "agents": [ { "id": "claude-code", "label": "Claude Code", "commits": 109 } ],
  "caveats": [ "..." ]
}
```

The headline field is named `agentSharePctFloor` on purpose, so no downstream consumer can render it as an estimate by accident.

## Agents detected

Claude Code · Cursor · GitHub Copilot · Devin · OpenAI Codex · Aider · Gemini CLI · OpenHands, Sweep, Codegen, Jules

Signature conventions change. OpenAI Codex stamped footers from November 2025 to mid-2026 and then stopped — any published figure needs to state its window.

## Requirements

Node 18+ and `git`. Zero dependencies.

## Licence

MIT
