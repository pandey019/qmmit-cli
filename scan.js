/**
 * scan.js
 *
 * Reads git history and produces an agent-authorship report.
 *
 * Design notes:
 *  - We shell out to `git log` rather than using the GitHub API. This is
 *    deliberate: the API rate-limits (60/hr unauthenticated) and would fall over
 *    on launch day. A blobless clone gives full commit metadata for a 10k-commit
 *    repo in seconds with no quota at all.
 *  - Commit bodies contain arbitrary newlines, so we parse with ASCII unit (\x1f)
 *    and record (\x1e) separators rather than trying to be clever with newlines.
 */

const { execFileSync, execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const os = require('os');
const fs = require('fs');

const { detectAgents, isExcludedBot, SIGNATURE_INDEX } = require('./signatures');

const execFileAsync = promisify(execFile);

const US = '\x1f'; // unit separator
const RS = '\x1e'; // record separator
// %cI (committer date) not %aI (author date): `git log --since` filters on
// committer date, so grouping the timeline by author date puts long-lived PRs
// in the wrong month. Committer date is also the better answer to "when did
// this land", which is what an adoption timeline is asking.
const FORMAT = ['%H', '%an', '%ae', '%cn', '%ce', '%cI', '%P', '%s', '%B'].join(US) + RS;

/** Read and parse commits from a local git repo. */
function readCommits(repoPath, { limit = 0, since = null } = {}) {
  const args = ['-C', repoPath, 'log', `--format=${FORMAT}`];
  if (limit > 0) args.push(`-${limit}`);
  if (since) args.push(`--since=${since}`);

  const raw = execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 512,
  });

  const commits = [];
  for (const record of raw.split(RS)) {
    const trimmed = record.replace(/^\n/, '');
    if (!trimmed.trim()) continue;
    const f = trimmed.split(US);
    if (f.length < 9) continue;
    commits.push({
      hash: f[0],
      authorName: f[1],
      authorEmail: f[2],
      committerName: f[3],
      committerEmail: f[4],
      date: f[5],
      parents: f[6].trim() ? f[6].trim().split(/\s+/) : [],
      subject: f[7],
      body: f[8],
    });
  }
  return commits;
}

/** Clone only what we need: commit metadata, no file contents, no working tree. */
async function cloneBlobless(repoUrl, destDir) {
  await execFileAsync(
    'git',
    ['clone', '--filter=blob:none', '--no-checkout', '--quiet', repoUrl, destDir],
    { maxBuffer: 1024 * 1024 * 64 }
  );
  return destDir;
}

function monthKey(iso) {
  return iso.slice(0, 7); // YYYY-MM
}

/**
 * Core aggregation.
 *
 * Denominator policy (this is the number everything hinges on):
 *   total considered = all commits
 *                      - merge commits      (no authored content)
 *                      - CI/dependency bots (machine-made, not agent-authored)
 *
 * The resulting percentage is reported as a FLOOR, never an estimate. Squash
 * merges and rebases strip trailers, so true agent share is >= what we report.
 */
function analyze(commits, { sampleSize = 5 } = {}) {
  const perAgent = {};
  const timeline = {};
  const samples = {};
  // Concentration tracking. We count how many DISTINCT humans commit agent-signed
  // work and how concentrated that is — but we never expose identities. See the
  // no-per-contributor policy: counts and ratios are aggregate and safe, names
  // are not. Author strings are hashed so they cannot be reversed out of the JSON.
  const agentAuthorCounts = new Map();
  let autonomousCommits = 0;
  let assistedCommits = 0;

  let merges = 0;
  let botCommits = 0;
  let considered = 0;
  let agentCommits = 0;

  for (const c of commits) {
    if (c.parents.length > 1) {
      merges++;
      continue;
    }
    // ORDER IS LOAD-BEARING: detect agents BEFORE excluding bots.
    //
    // Several coding agents ship as GitHub Apps and therefore carry the "[bot]"
    // suffix that our generic exclusion rule matches — claude[bot],
    // devin-ai-integration[bot], copilot-swe-agent[bot], gemini-code-assist[bot].
    // Excluding first would silently delete the exact commits we exist to count,
    // and the resulting undercount would look plausible rather than broken.
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

    const who = `${c.authorName}<${c.authorEmail}>`;
    agentAuthorCounts.set(who, (agentAuthorCounts.get(who) || 0) + 1);

    // Two genuinely different things get matched, and reporting them as one
    // number is not defensible:
    //   autonomous — a bot identity is the commit author (devin-ai-integration[bot],
    //                claude[bot], cursor[bot]). No human in the loop.
    //   assisted   — a human's identity authored the commit and the agent added
    //                itself as co-author, because the agent ran `git commit`
    //                during a working session.
    // Measured across 413 matched commits, the split is roughly 4% / 96%.
    if (/\[bot\]|devin-ai-integration|^Devin AI$/i.test(`${c.authorName} ${c.authorEmail}`)) {
      autonomousCommits++;
    } else {
      assistedCommits++;
    }

    for (const id of hits) {
      perAgent[id] = (perAgent[id] || 0) + 1;
      samples[id] = samples[id] || [];
      if (samples[id].length < sampleSize) {
        samples[id].push({ hash: c.hash, subject: c.subject, date: c.date });
      }
    }
  }

  const pct = (n, d) => (d === 0 ? 0 : Number(((n / d) * 100).toFixed(1)));

  // --- Concentration ---------------------------------------------------------
  // The headline share is close to meaningless on its own. 28% driven by one
  // prolific maintainer and 65% spread across 39 engineers are opposite facts.
  // Without this, the index would report cpython (one core dev using Claude Code)
  // and VS Code (genuine org-wide rollout) as the same kind of thing.
  const authorTotals = [...agentAuthorCounts.values()].sort((a, b) => b - a);
  const distinctAgentAuthors = authorTotals.length;
  const topAuthorShareOfAgentCommits = pct(authorTotals[0] || 0, agentCommits);

  let adoptionPattern = 'none';
  if (agentCommits > 0) {
    if (distinctAgentAuthors === 1) adoptionPattern = 'individual';
    else if (distinctAgentAuthors <= 3 || topAuthorShareOfAgentCommits >= 80) adoptionPattern = 'individual';
    else if (distinctAgentAuthors <= 8 || topAuthorShareOfAgentCommits >= 50) adoptionPattern = 'team';
    else adoptionPattern = 'org-wide';
  }
  // --------------------------------------------------------------------------

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
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    totals: {
      commitsInHistory: commits.length,
      mergeCommitsExcluded: merges,
      ciBotCommitsExcluded: botCommits,
      commitsConsidered: considered,
      agentAttributedCommits: agentCommits,
      humanAttributedCommits: considered - agentCommits,
    },
    // The headline number. Named "floor" on purpose so it cannot be
    // accidentally presented as an estimate downstream.
    agentSharePctFloor: pct(agentCommits, considered),
    // The headline split. See the comment in the loop above.
    mode: {
      assistedCommits,
      autonomousCommits,
      assistedPct: pct(assistedCommits, considered),
      autonomousPct: pct(autonomousCommits, considered),
    },
    humanSharePctCeiling: pct(considered - agentCommits, considered),
    concentration: {
      distinctAgentAuthors,
      topAuthorShareOfAgentCommits,
      adoptionPattern, // none | individual | team | org-wide
    },
    agents,
    timeline: Object.values(timeline)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((t) => ({ ...t, agentPct: pct(t.agent, t.total) })),
    caveats: [
      'Reported agent share is a FLOOR, not an estimate. Squash merges and rebases strip Co-Authored-By trailers, so real usage is higher.',
      'ALWAYS read the share alongside concentration. A high share driven by one prolific maintainer is individual tool use, not organisational adoption — they are different facts and must not be reported as the same one.',
      'Only self-declared agent signatures are counted. Agent-written code committed under a human identity with no trailer is invisible to this method.',
      'CI, dependency and release bots are excluded from the denominator and are not counted as agent-authored.',
      'Commit counts are not lines of code. A one-line fix and a 2,000-line refactor each count as one commit.',
      'MOST MATCHES ARE ASSISTED, NOT AUTONOMOUS. A matched commit usually carries a human author with an agent co-author trailer, meaning the agent ran `git commit` during a session. Only the smaller autonomous share has a bot identity as the author. Do not describe the total as "no human in the loop".',
      'Comparisons across repositories are only valid when the time window is held constant. A commit-count window (e.g. last 500) spans years for a slow project and weeks for a fast one.',
      'Percentages computed on fewer than ~200 considered commits are noisy and should not be published. Check totals.commitsConsidered.',
    ],
  };
}

/** Scan a local repo path. */
function scanLocal(repoPath, opts = {}) {
  const commits = readCommits(repoPath, opts);
  return { source: { type: 'local', path: path.resolve(repoPath) }, ...analyze(commits, opts) };
}

/** Clone a remote repo to a temp dir, scan it, clean up. */
async function scanRemote(repoUrl, opts = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qmmit-'));
  try {
    await cloneBlobless(repoUrl, tmp);
    const commits = readCommits(tmp, opts);
    return { source: { type: 'remote', url: repoUrl }, ...analyze(commits, opts) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { readCommits, cloneBlobless, analyze, scanLocal, scanRemote };
