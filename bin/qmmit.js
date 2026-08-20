#!/usr/bin/env node
'use strict';

/**
 * qmmit — measure how much of a git repository is committed by AI agents.
 *
 * Usage:
 *   qmmit                          the repository you are standing in
 *   qmmit ./path/to/repo           any local clone, including private
 *   qmmit owner/repo               clone + scan a public GitHub repository
 *   qmmit https://host/x.git       any git remote
 *
 * Options:
 *   --since <date>   only commits after <date> (git date syntax)
 *   --limit <n>      only the most recent <n> commits
 *   --json           machine-readable output
 *   --no-color       plain output
 *   -h, --help       this message
 *
 * Prefer --since over --limit when comparing repositories. A commit-count
 * window spans years for a slow project and weeks for a fast one.
 */

const { scanLocal, scanRemote, remoteExists } = require('../src');
const { render } = require('../src/format');
const pkg = require('../package.json');

const HELP = `
  qmmit ${pkg.version} — how much of a repo is committed by AI agents

  Usage
    qmmit                      scan the current repository
    qmmit ./path/to/repo       scan a local clone (works on private repos)
    qmmit owner/repo           clone + scan a public GitHub repository
    qmmit https://host/x.git   scan any git remote

  Options
    --since <date>   only commits after <date>, e.g. 2026-02-01
    --limit <n>      only the most recent <n> commits
    --json           machine-readable output
    --no-color       disable colour
    -h, --help       show this message
    -v, --version    print version

  Comparing repositories? Use --since, not --limit. A commit-count window
  spans years for a slow project and weeks for a fast one, so it measures
  commit velocity as much as agent adoption.

  https://qmmit.dev
`;

function parseArgs(argv) {
  const opts = { target: '.', json: false, limit: 0, since: null, color: true };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--limit') opts.limit = parseInt(argv[++i], 10) || 0;
    else if (a === '--since') opts.since = argv[++i];
    else if (a === '--no-color') opts.color = false;
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '-v' || a === '--version') opts.version = true;
    else if (!a.startsWith('-')) rest.push(a);
  }
  if (rest.length) opts.target = rest[0];
  return opts;
}

function resolveTarget(target) {
  if (/^(https?:\/\/|git@)/.test(target)) return { kind: 'remote', url: target };
  if (/^[\w.-]+\/[\w.-]+$/.test(target) && !target.startsWith('.')) {
    return { kind: 'remote', url: `https://github.com/${target}.git` };
  }
  return { kind: 'local', path: target };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return console.log(HELP);
  if (opts.version) return console.log(pkg.version);

  const target = resolveTarget(opts.target);
  const scanOpts = { limit: opts.limit, since: opts.since };
  const useColor = opts.color && process.stdout.isTTY;

  let report;
  try {
    if (target.kind === 'remote') {
      // Check first: git blocks on a credential prompt for a missing repo,
      // which otherwise looks like a hang rather than a 404.
      if (!(await remoteExists(target.url))) {
        console.error(
          `\n  Can't reach ${target.url}\n  It may be private, renamed, or misspelled.\n`
        );
        process.exit(1);
      }
      if (!opts.json) process.stderr.write('  cloning metadata…\n');
      report = await scanRemote(target.url, scanOpts);
    } else {
      report = scanLocal(target.path, scanOpts);
    }
  } catch (err) {
    const msg = String(err.message || err).split('\n')[0];
    console.error(`\n  Scan failed: ${msg}\n`);
    process.exit(1);
  }

  console.log(opts.json ? JSON.stringify(report, null, 2) : render(report, { color: useColor }));
}

main();
