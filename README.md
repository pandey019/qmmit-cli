<div align="center">

# qmmit

**Measure how much of a git repository is committed by AI coding agents.**

[![CI](https://github.com/pandey019/qmmit-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/pandey019/qmmit-cli/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/qmmit-cli)](https://www.npmjs.com/package/qmmit-cli)
[![node](https://img.shields.io/node/v/qmmit-cli)](https://www.npmjs.com/package/qmmit-cli)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[**qmmit.dev**](https://qmmit.dev) — the public index of 123 repositories

</div>

```bash
npx qmmit-cli
```

Runs entirely on your machine. Works on private repositories, because nothing is uploaded anywhere.

```
  qmmit  ·  agent-authorship report

  22.4% of commits are provably agent-authored (floor)
  ██████░░░░░░░░░░░░░░░░░░░░░░

  924 commits considered  ·  207 agent  ·  717 human
  excluded: 116 merges, 191 CI/dependency bots

  Adoption pattern: org-wide  (broad adoption)
    22 distinct contributors  ·  top one accounts for 18.6% of agent commits
    128 assisted (human authored)  ·  76 autonomous (bot authored)
```

---

## What we found

Run across **123 open source repositories — 182,354 commits**, all measured over the same window (February–August 2026). Full data at [qmmit.dev](https://qmmit.dev).

### 94% of AI commits still have a human in the loop

| | Share of all commits |
|---|---|
| **Assisted** — a developer's identity authored the commit, agent added as co-author | **10.3%** |
| **Autonomous** — a bot identity is the author, no human involved | **0.7%** |

A matched commit is usually Claude Code or Cursor running `git commit` during a working session, under the developer's own identity. Fully autonomous agents shipping code — Devin, `claude[bot]` — are real but rare. Reporting these as one number would be misleading, so they are reported separately.

### Adoption is concentrated, not widespread

Aggregate share is **11%**. Median repository is **3.9%**. Eleven repositories sit at exactly zero — including Angular, Django, esbuild, godot, Jest and Puppeteer.

| Pattern | Repos |
|---|---|
| org-wide — broad adoption | 46 |
| team — a small group | 37 |
| individual — essentially one person | 29 |
| none | 11 |

### A percentage on its own is close to meaningless

These two numbers look comparable and mean opposite things:

| Repo | Share | Contributors | Top contributor | Reality |
|---|---|---|---|---|
| pandas | 54.8% | 12 | **97.4%** | one maintainer's workflow |
| microsoft/vscode | 30.8% | **155** | 9.7% | genuine org-wide rollout |

That is why every result reports **concentration alongside the share**, and classifies each repository as `individual`, `team` or `org-wide`. Among individual-driven repos the median top contributor accounts for **88.7%** of all agent commits.

### Highest adoption measured

| # | Repository | Agent share | Pattern | Contributors |
|---|---|---|---|---|
| 1 | All-Hands-AI/OpenHands | 62.5% | org-wide | 54 |
| 2 | framer/motion | 61.2% | individual | 2 |
| 3 | pandas-dev/pandas | 54.8% | individual | 12 |
| 4 | denoland/fresh | 54.1% | team | 12 |
| 5 | cypress-io/cypress | 52.0% | org-wide | 15 |
| 6 | calcom/cal.com | 41.8% | org-wide | 41 |
| 7 | continuedev/continue | 37.7% | org-wide | 13 |
| 8 | microsoft/vscode | 30.8% | org-wide | 155 |

### The ecosystem gap is 20x

| Ecosystem | Median share | n |
|---|---|---|
| Data/viz | 10.9% | 6 |
| AI/agent tools | 9.8% | 21 |
| Product companies | 9.2% | 19 |
| UI libraries | 7.0% | 10 |
| JS/TS frameworks | 5.2% | 10 |
| Build tools | 4.4% | 16 |
| Backend/ORM | 3.5% | 6 |
| Editors/desktop | 2.7% | 5 |
| Rust | 1.5% | 10 |
| Python | 1.4% | 9 |
| **Go** | **0.5%** | 7 |

Systems-language ecosystems have barely started. Web tooling and AI projects are an order of magnitude ahead.

---

## What it does not measure

**Code written with AI help that a human committed by hand.** Git records who ran `git commit`, not who typed the code.

| | Detected? |
|---|---|
| The agent ran the commit and signed it (Claude Code, Cursor default) | yes |
| A bot identity authored the commit outright (Devin, `claude[bot]`) | yes |
| You wrote code with an agent, then ran `git commit` yourself | **no** |

A 0% result means nobody's tooling is signing commits. It does not mean no AI was involved. This is why every figure is a **floor** — the real number can only be higher.

---

## Usage

```bash
qmmit                              # the repo you're standing in
qmmit ~/work/internal-api          # any local clone, including private
qmmit owner/repo                   # clone + scan a public GitHub repo
qmmit https://git.example.com/x    # any git remote

qmmit --since 2026-02-01           # fixed time window
qmmit --limit 500                  # most recent N commits
qmmit --json                       # machine readable
```

**Use `--since`, not `--limit`, when comparing repositories.** A commit-count window spans years for a slow project and weeks for a fast one. This is not hypothetical — it produced a 6.7x bias in our own first dataset. See [CORRECTIONS.md](https://github.com/pandey019/qmmit-cli/blob/main/docs/CORRECTIONS.md).

### As a library

```js
const { scanLocal, scanRemote } = require('qmmit-cli');

const report = scanLocal('.', { since: '2026-02-01' });
console.log(report.agentSharePctFloor, report.concentration.adoptionPattern);
```

---

## How it works

Reads history with a blobless clone — commit metadata only, no file contents, no working tree:

```
git clone --filter=blob:none --no-checkout <url>
```

No GitHub API, so no rate limits and no token. A 9,000-commit repository takes about six seconds.

Detection is **deterministic string matching** against signatures agents write about themselves. No heuristics, no style analysis, no perplexity scoring — those don't work reliably on code, where formatters erase the signal, and one confident false positive would cost more than the feature is worth.

All rules live in one readable file: [`src/signatures.js`](https://github.com/pandey019/qmmit-cli/blob/main/src/signatures.js).

| Agent | Signals |
|---|---|
| Claude Code | `Co-Authored-By: Claude`, "Generated with Claude Code", `claude[bot]` |
| Cursor | `Co-Authored-By: Cursor`, `cursoragent@cursor.com`, `cursor[bot]` |
| GitHub Copilot | `Co-Authored-By: Copilot`, `copilot-swe-agent[bot]` |
| Devin | `devin-ai-integration[bot]` |
| OpenAI Codex | `chatgpt.com/codex/` footer |
| Aider | `(aider)` subject suffix |
| Gemini CLI | `Co-Authored-By: Gemini`, `gemini-code-assist[bot]` |

**Bots are excluded by the `[bot]` convention, not a name list**, because every repository invents its own release bot. Some repositories are over 40% bot commits — counting dependabot as AI-written code produces a meaningless number.

**Agent detection runs before bot exclusion.** Several agents ship as GitHub Apps and carry `[bot]` themselves. Excluding first silently deletes the exact commits the tool exists to count. [There is a test for this.](https://github.com/pandey019/qmmit-cli/blob/main/test/detection.test.js)

Full detail in [docs/METHODOLOGY.md](https://github.com/pandey019/qmmit-cli/blob/main/docs/METHODOLOGY.md).

---

## We got things wrong

[**docs/CORRECTIONS.md**](https://github.com/pandey019/qmmit-cli/blob/main/docs/CORRECTIONS.md) documents two material flaws found in this project's own data *before* publishing:

1. **"Last 500 commits" is not a time window.** It spanned 62 months for django and 2 months for supabase. Slow projects were measured across an era when agents barely existed — a 6.7x bias that reversed the ecosystem ranking entirely.

2. **"Autonomous" was wrong for 96% of matches.** Most matched commits carry a human author with an agent co-author trailer, not a bot acting alone.

Both are fixed. The document stays up because a measurement tool that has never published its mistakes has not really been tested.

---

## Privacy

**It reports counts, never names.** You get how many contributors commit agent-signed work and how concentrated that is — never who they are.

There is no flag to change this, including for local scans of your own repository. The information is already in `git log`, but a tool that packages it into a ranked report removes the friction that stops people acting on it, and that report ends up in front of someone's manager.

[This is enforced by a test](https://github.com/pandey019/qmmit-cli/blob/main/test/detection.test.js), not just a promise.

---

## Project layout

```
bin/qmmit.js          CLI entry point
src/signatures.js     detection rules — written to be read by skeptics
src/git.js            cloning and reading history
src/analyze.js        aggregation, concentration, assisted/autonomous split
src/format.js         terminal output
src/index.js          public API
test/                 23 tests covering detection, exclusion and reporting
docs/METHODOLOGY.md   what is counted and why
docs/CORRECTIONS.md   flaws found in this project's own data
```

```bash
npm test
```

---

## Contributing

The most useful contribution is **a missing or wrong signature**. Open an issue with a link to a public commit showing it — a real example, not a description.

Methodology criticism is welcome. See [CONTRIBUTING.md](https://github.com/pandey019/qmmit-cli/blob/main/CONTRIBUTING.md).

---

## Licence

MIT
