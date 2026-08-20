'use strict';

/**
 * Turning commits into a report.
 *
 * Two decisions in here carry the whole method, and both are commented at the
 * point they happen: what goes in the denominator, and why detection has to run
 * before bot exclusion.
 */

const { detectAgents, isExcludedBot, SIGNATURE_INDEX } = require('./signatures');

const SCHEMA_VERSION = 2;

/** Below this, a percentage is noise and should not be published. */
const MIN_PUBLISHABLE_COMMITS = 100;

const pct = (n, d) => (d === 0 ? 0 : Number(((n / d) * 100).toFixed(1)));

const monthKey = (iso) => iso.slice(0, 7);

/**
 * Is this commit authored by a bot identity rather than a person?
 * Used to separate autonomous agent commits from assisted ones.
 */
function isBotIdentity(commit) {
  return /\[bot\]|devin-ai-integration|^Devin AI$/i.test(
    `${commit.authorName} ${commit.authorEmail}`
  );
}

/**
 * Classify how concentrated agent usage is.
 *
 * A share on its own is close to meaningless: 74% driven by one maintainer and
 * 41% spread across forty engineers are opposite facts. Thresholds are
 * deliberate but arbitrary — the raw contributor count and top-author share are
 * always reported alongside so anyone can draw their own line.
 */
function classifyAdoption(distinctAuthors, topAuthorShare) {
  if (distinctAuthors === 0) return 'none';
  if (distinctAuthors <= 3 || topAuthorShare >= 80) return 'individual';
  if (distinctAuthors <= 8 || topAuthorShare >= 50) return 'team';
  return 'org-wide';
}

const CAVEATS = [
  'Reported agent share is a FLOOR, not an estimate. Squash merges and rebases strip Co-Authored-By trailers, so real usage is higher.',
  'MOST MATCHES ARE ASSISTED, NOT AUTONOMOUS. A matched commit usually carries a human author with an agent co-author trailer, meaning the agent ran `git commit` during a session. Only the smaller autonomous share has a bot identity as the author. Do not describe the total as "no human in the loop".',
  'ALWAYS read the share alongside concentration. A high share driven by one prolific maintainer is individual tool use, not organisational adoption.',
  'Only self-declared agent signatures are counted. Agent-written code committed under a human identity with no trailer is invisible to this method.',
  'CI, dependency and release bots are excluded from the denominator and are not counted as agent-authored.',
  'Commit counts are not lines of code. A one-line fix and a 2,000-line refactor each count as one commit.',
  'Comparisons across repositories are only valid when the time window is held constant. A commit-count window (e.g. last 500) spans years for a slow project and weeks for a fast one.',
  `Percentages computed on fewer than ~${MIN_PUBLISHABLE_COMMITS} considered commits are noisy and should not be published.`,
];

/**
 * Denominator policy — the number everything else depends on:
 *
 *   considered = all commits
 *              − merge commits        (no authored content)
 *              − CI/dependency bots   (machine-made, not agent-authored)
 */
function analyze(commits, { sampleSize = 5 } = {}) {
  const perAgent = {};
  const timeline = {};
  const samples = {};
  const agentAuthorCounts = new Map();

  let merges = 0;
  let botCommits = 0;
  let considered = 0;
  let agentCommits = 0;
  let assistedCommits = 0;
  let autonomousCommits = 0;

  for (const c of commits) {
    if (c.parents.length > 1) {
      merges++;
      continue;
    }

    // ORDER IS LOAD-BEARING: detect agents BEFORE excluding bots.
    //
    // Several coding agents ship as GitHub Apps and so carry the "[bot]" suffix
    // that the generic exclusion rule matches — claude[bot],
    // devin-ai-integration[bot], copilot-swe-agent[bot]. Excluding first would
    // silently delete the exact commits this tool exists to count, and the
    // resulting undercount would look plausible rather than broken.
    const hits = detectAgents(c);

    if (hits.length === 0 && isExcludedBot(c)) {
      botCommits++;
      continue;
    }

    considered++;
    const mk = monthKey(c.date);
    timeline[mk] = timeline[mk] || { month: mk, total: 0, agent: 0 };
    timeline[mk].total++;

    if (hits.length === 0) continue;

    agentCommits++;
    timeline[mk].agent++;

    // Author identities are counted, never exposed. Counts and ratios are
    // aggregate and safe; names are the per-contributor breakdown this tool
    // deliberately does not produce.
    const who = `${c.authorName}<${c.authorEmail}>`;
    agentAuthorCounts.set(who, (agentAuthorCounts.get(who) || 0) + 1);

    if (isBotIdentity(c)) autonomousCommits++;
    else assistedCommits++;

    for (const id of hits) {
      perAgent[id] = (perAgent[id] || 0) + 1;
      samples[id] = samples[id] || [];
      if (samples[id].length < sampleSize) {
        samples[id].push({ hash: c.hash, subject: c.subject, date: c.date });
      }
    }
  }

  const authorTotals = [...agentAuthorCounts.values()].sort((a, b) => b - a);
  const distinctAgentAuthors = authorTotals.length;
  const topAuthorShareOfAgentCommits = pct(authorTotals[0] || 0, agentCommits);

  const agents = Object.entries(perAgent)
    .map(([id, count]) => ({
      id,
      label: SIGNATURE_INDEX[id] ? SIGNATURE_INDEX[id].label : id,
      vendor: SIGNATURE_INDEX[id] ? SIGNATURE_INDEX[id].vendor : 'Unknown',
      commits: count,
      sharePct: pct(count, considered),
      samples: samples[id] || [],
    }))
    .sort((a, b) => b.commits - a.commits);

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    totals: {
      commitsInHistory: commits.length,
      mergeCommitsExcluded: merges,
      ciBotCommitsExcluded: botCommits,
      commitsConsidered: considered,
      agentAttributedCommits: agentCommits,
      humanAttributedCommits: considered - agentCommits,
    },
    // Named "floor" so it cannot be presented as an estimate downstream.
    agentSharePctFloor: pct(agentCommits, considered),
    humanSharePctCeiling: pct(considered - agentCommits, considered),
    mode: {
      assistedCommits,
      autonomousCommits,
      assistedPct: pct(assistedCommits, considered),
      autonomousPct: pct(autonomousCommits, considered),
    },
    concentration: {
      distinctAgentAuthors,
      topAuthorShareOfAgentCommits,
      adoptionPattern: classifyAdoption(
        distinctAgentAuthors,
        topAuthorShareOfAgentCommits
      ),
    },
    lowActivity: considered < MIN_PUBLISHABLE_COMMITS,
    agents,
    timeline: Object.values(timeline)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((t) => ({ ...t, agentPct: pct(t.agent, t.total) })),
    caveats: CAVEATS,
  };
}

module.exports = {
  analyze,
  classifyAdoption,
  isBotIdentity,
  pct,
  SCHEMA_VERSION,
  MIN_PUBLISHABLE_COMMITS,
  CAVEATS,
};
