'use strict';

/**
 * Reading git history.
 *
 * We shell out to `git log` rather than using a host API. The GitHub API
 * rate-limits at 60 requests/hour unauthenticated, which fails at exactly the
 * moment a tool like this gets attention. A blobless clone has no quota and
 * pulls 9,000 commits of metadata in about six seconds.
 */

const { execFile, execFileSync } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');

const execFileAsync = promisify(execFile);

// ASCII unit/record separators. Commit bodies contain arbitrary newlines and
// user text, so line-based parsing breaks on real history; these bytes cannot
// appear in git output.
const US = '\x1f';
const RS = '\x1e';

// %cI (committer date) rather than %aI (author date): `git log --since` filters
// on committer date, so grouping a timeline by author date puts long-lived
// pull requests in the wrong month.
const FORMAT =
  ['%H', '%an', '%ae', '%cn', '%ce', '%cI', '%P', '%s', '%B'].join(US) + RS;

/** Parse raw `git log` output into commit records. */
function parseLog(raw) {
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

/** Read commits from a local repository. */
function readCommits(repoPath, { limit = 0, since = null } = {}) {
  const args = ['-C', repoPath, 'log', `--format=${FORMAT}`];
  if (limit > 0) args.push(`-${limit}`);
  if (since) args.push(`--since=${since}`);

  const raw = execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 512,
  });
  return parseLog(raw);
}

/** Clone metadata only — no file contents, no working tree. */
async function cloneBlobless(repoUrl, destDir) {
  await execFileAsync(
    'git',
    ['clone', '--filter=blob:none', '--no-checkout', '--quiet', repoUrl, destDir],
    { maxBuffer: 1024 * 1024 * 64 }
  );
  return destDir;
}

/**
 * Check a remote exists before cloning.
 *
 * Without GIT_TERMINAL_PROMPT=0, git blocks asking for a username when a repo
 * is missing or private, so a 404 is indistinguishable from a slow clone. This
 * turns that into a fast, explicit failure.
 */
async function remoteExists(repoUrl) {
  try {
    await execFileAsync('git', ['ls-remote', '--exit-code', '-h', repoUrl], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' },
      timeout: 15000,
    });
    return true;
  } catch {
    return false;
  }
}

/** Clone to a temp dir, hand it to fn, then always clean up. */
async function withTempClone(repoUrl, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qmmit-'));
  try {
    await cloneBlobless(repoUrl, tmp);
    return await fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = {
  FORMAT,
  US,
  RS,
  parseLog,
  readCommits,
  cloneBlobless,
  remoteExists,
  withTempClone,
};
