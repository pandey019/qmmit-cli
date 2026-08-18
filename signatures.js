/**
 * signatures.js
 *
 * Deterministic agent-authorship signatures.
 *
 * RULE: Everything in this file must be a literal string or a tightly anchored
 * regex that an agent tool WRITES ITSELF into commit metadata. No inference,
 * no heuristics, no vibes. If a signal requires judgement, it does not belong
 * here — it belongs in heuristics.js (v2) and must be reported separately.
 *
 * This file is the credibility surface of the entire project. It is meant to be
 * read by skeptics. Keep it boring and auditable.
 */

/**
 * Each signature has:
 *   id      - stable machine key
 *   label   - display name
 *   vendor  - who ships the agent
 *   match   - array of matchers against a parsed commit
 *
 * Matcher kinds:
 *   trailer  - regex tested against the commit body (Co-Authored-By etc.)
 *   identity - regex tested against "Name <email>" of author AND committer
 *   footer   - regex tested against the commit body (tool-written footers)
 *   subject  - regex tested against the commit subject line only
 */
const AGENT_SIGNATURES = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    vendor: 'Anthropic',
    match: [
      { kind: 'trailer', re: /^\s*Co-Authored-By:\s*Claude\b/im },
      { kind: 'footer', re: /Generated with .{0,20}Claude Code/i },
      { kind: 'identity', re: /^claude\[bot\]\s*</i },
      { kind: 'identity', re: /<[^>]*@anthropic\.com>/i },
    ],
  },
  {
    id: 'cursor',
    label: 'Cursor Agent',
    vendor: 'Anysphere',
    match: [
      { kind: 'trailer', re: /^\s*Co-Authored-By:\s*Cursor\b/im },
      { kind: 'identity', re: /<cursoragent@cursor\.com>/i },
      { kind: 'identity', re: /^Cursor Agent\s*</i },
      { kind: 'identity', re: /\bcursor\[bot\]/i },
    ],
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    vendor: 'GitHub',
    match: [
      { kind: 'trailer', re: /^\s*Co-Authored-By:\s*Copilot\b/im },
      { kind: 'identity', re: /^copilot(-swe-agent)?\[bot\]\s*</i },
    ],
  },
  {
    id: 'devin',
    label: 'Devin',
    vendor: 'Cognition',
    match: [
      { kind: 'identity', re: /devin-ai-integration\[bot\]/i },
      { kind: 'identity', re: /^Devin AI\s*</i },
      { kind: 'trailer', re: /^\s*Co-Authored-By:\s*Devin\b/im },
    ],
  },
  {
    id: 'codex',
    label: 'OpenAI Codex',
    vendor: 'OpenAI',
    match: [
      { kind: 'footer', re: /https:\/\/chatgpt\.com\/codex\//i },
      { kind: 'trailer', re: /^\s*Co-Authored-By:\s*Codex\b/im },
      { kind: 'identity', re: /^chatgpt-codex-connector\[bot\]/i },
    ],
  },
  {
    id: 'aider',
    label: 'Aider',
    vendor: 'Aider',
    // Aider appends "(aider)" to the subject line by default.
    match: [{ kind: 'subject', re: /\(aider\)\s*$/i }],
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    vendor: 'Google',
    match: [
      { kind: 'trailer', re: /^\s*Co-Authored-By:\s*Gemini\b/im },
      { kind: 'identity', re: /^gemini-code-assist\[bot\]/i },
    ],
  },
  {
    id: 'codegen-generic',
    label: 'Other / generic agent',
    vendor: 'Various',
    match: [
      { kind: 'trailer', re: /^\s*Co-Authored-By:\s*(OpenHands|Sweep|Codegen|Jules)\b/im },
      { kind: 'identity', re: /^(openhands|sweep-ai|jules)\[bot\]/i },
    ],
  },
];

/**
 * CI / dependency / release automation. These commits are machine-generated but
 * they are NOT agent-authored source code. Counting them as "AI-written" is the
 * single fastest way to lose all credibility, so they are removed from the
 * denominator entirely and reported separately.
 */
const EXCLUDED_BOTS = [
  // PRIMARY RULE: GitHub appends "[bot]" to every GitHub App identity. This is a
  // convention, not a list, so it covers per-repo release bots we have never
  // heard of (next-js-bot[bot], firecrawl-spring[bot], ...) without needing to
  // enumerate them. Enumerating bot names does not scale — every repo has its own.
  //
  // SAFETY: several coding agents are ALSO GitHub Apps (claude[bot],
  // devin-ai-integration[bot], copilot-swe-agent[bot]). Agent detection therefore
  // runs FIRST and wins. See isExcludedBot() and the ordering in scan.js analyze().
  /\[bot\]\s*</i,
  /\[bot\]@users\.noreply\.github\.com/i,

  // SECONDARY: automation that does not use the [bot] suffix.
  /^Vercel Release Bot\s*</i,
  /release[- ]bot\s*</i,
  /\bsnyk-bot\b/i,
  /\bsemantic-release-bot\b/i,
  /\bgreenkeeper\b/i,
  /\bweblate\b/i,
  /\bcrowdin[- ]?bot\b/i,
  /\btravis[- ]ci\b/i,
  /\bnetlify\[?bot\]?\b/i,
];

function identityString(commit) {
  return `${commit.authorName} <${commit.authorEmail}>\n${commit.committerName} <${commit.committerEmail}>`;
}

/** Is this commit CI/dependency automation rather than a coding agent? */
function isExcludedBot(commit) {
  const id = identityString(commit);
  return EXCLUDED_BOTS.some((re) => re.test(id));
}

/**
 * Returns the list of agent ids detected on a commit (usually 0 or 1, but a
 * commit can legitimately carry two, e.g. a human using Cursor whose CI adds a
 * Copilot trailer).
 */
function detectAgents(commit) {
  const identity = identityString(commit);
  const hits = [];

  for (const sig of AGENT_SIGNATURES) {
    const matched = sig.match.some((m) => {
      switch (m.kind) {
        case 'identity':
          return m.re.test(identity);
        case 'subject':
          return m.re.test(commit.subject);
        case 'trailer':
        case 'footer':
          return m.re.test(commit.body);
        default:
          return false;
      }
    });
    if (matched) hits.push(sig.id);
  }
  return hits;
}

const SIGNATURE_INDEX = Object.fromEntries(AGENT_SIGNATURES.map((s) => [s.id, s]));

module.exports = {
  AGENT_SIGNATURES,
  EXCLUDED_BOTS,
  SIGNATURE_INDEX,
  detectAgents,
  isExcludedBot,
};
