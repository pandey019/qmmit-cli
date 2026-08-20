'use strict';

/**
 * qmmit — measure how much of a git repository is committed by AI agents.
 *
 * Public API:
 *   scanLocal(path, opts)   scan a repository already on disk
 *   scanRemote(url, opts)   clone metadata to a temp dir, scan, clean up
 *   analyze(commits, opts)  aggregate commit records you supply yourself
 *
 * Options: { limit, since, sampleSize }
 * Prefer `since` over `limit` when comparing repositories — see docs/METHODOLOGY.md.
 */

const path = require('path');
const { readCommits, withTempClone, remoteExists } = require('./git');
const { analyze } = require('./analyze');
const signatures = require('./signatures');

function scanLocal(repoPath, opts = {}) {
  const commits = readCommits(repoPath, opts);
  return {
    source: { type: 'local', path: path.resolve(repoPath) },
    ...analyze(commits, opts),
  };
}

async function scanRemote(repoUrl, opts = {}) {
  return withTempClone(repoUrl, async (dir) => ({
    source: { type: 'remote', url: repoUrl },
    ...analyze(readCommits(dir, opts), opts),
  }));
}

module.exports = {
  scanLocal,
  scanRemote,
  analyze,
  remoteExists,
  readCommits,
  signatures,
};
