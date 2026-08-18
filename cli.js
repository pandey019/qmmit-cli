#!/usr/bin/env node
/**
 * qmmit-cli
 *
 * Usage:
 *   qmmit-cli                       scan the current repo
 *   qmmit-cli ./path/to/repo        scan a local repo
 *   qmmit-cli owner/repo            clone + scan a GitHub repo
 *   qmmit-cli https://host/x.git    clone + scan any git remote
 *
 * Flags:
 *   --json            machine-readable output
 *   --limit N         only the most recent N commits
 *   --since <date>    only commits after <date> (git date syntax)
 *   --no-color        plain output
 */

const { scanLocal, scanRemote } = require('./scan');

const C = {
  on: process.stdout.isTTY && !process.argv.includes('--no-color'),
  wrap(code, s) {
    return this.on ? `\x1b[${code}m${s}\x1b[0m` : s;
  },
  bold: (s) => C.wrap(1, s),
  dim: (s) => C.wrap(2, s),
  cyan: (s) => C.wrap(36, s),
  yellow: (s) => C.wrap(33, s),
};

function parseArgs(argv) {
  const opts = { target: '.', json: false, limit: 0, since: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--limit') opts.limit = parseInt(argv[++i], 10) || 0;
    else if (a === '--since') opts.since = argv[++i];
    else if (a === '--no-color') continue;
    else if (a === '--help' || a === '-h') opts.help = true;
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

function bar(pct, width = 28) {
  const filled = Math.round((pct / 100) * width);
  return '█'.repeat(filled) + C.dim('░'.repeat(width - filled));
}

function render(r) {
  const t = r.totals;
  const out = [];
  out.push('');
  out.push(C.bold('  qmmit-cli') + C.dim('  ·  agent-authorship report'));
  out.push('');
  out.push(
    `  ${C.bold(C.cyan(r.agentSharePctFloor + '%'))} of commits are provably agent-authored ` +
      C.dim('(floor)')
  );
  out.push(`  ${bar(r.agentSharePctFloor)}`);
  out.push('');
  out.push(
    C.dim(
      `  ${t.commitsConsidered.toLocaleString()} commits considered  ·  ` +
        `${t.agentAttributedCommits.toLocaleString()} agent  ·  ` +
        `${t.humanAttributedCommits.toLocaleString()} human`
    )
  );
  out.push(
    C.dim(
      `  excluded: ${t.mergeCommitsExcluded.toLocaleString()} merges, ` +
        `${t.ciBotCommitsExcluded.toLocaleString()} CI/dependency bots`
    )
  );

  if (r.agents.length) {
    const c = r.concentration;
    const patternLabel = {
      individual: 'individual  (one person driving this)',
      team: 'team  (a small group)',
      'org-wide': 'org-wide  (broad adoption)',
      none: 'none',
    }[c.adoptionPattern];
    out.push('');
    out.push(C.bold('  Adoption pattern: ') + C.cyan(patternLabel));
    out.push(
      C.dim(
        `    ${c.distinctAgentAuthors} distinct contributor${c.distinctAgentAuthors === 1 ? '' : 's'}` +
          `  ·  top one accounts for ${c.topAuthorShareOfAgentCommits}% of agent commits`
      )
    );
  }

  if (r.totals.commitsConsidered < 200) {
    out.push('');
    out.push(
      C.yellow(`  ! Only ${r.totals.commitsConsidered} commits considered — percentage is noisy, do not publish.`)
    );
  }

  if (r.agents.length) {
    out.push('');
    out.push(C.bold('  Agents detected'));
    for (const a of r.agents) {
      const name = a.label.padEnd(20);
      out.push(
        `    ${name} ${String(a.commits).padStart(6)} commits  ${C.dim(a.sharePct + '%')}`
      );
    }
  } else {
    out.push('');
    out.push(C.yellow('  No agent signatures found in this history.'));
  }

  const recent = r.timeline.slice(-6);
  if (recent.length > 1) {
    out.push('');
    out.push(C.bold('  Recent months'));
    for (const m of recent) {
      out.push(`    ${m.month}  ${bar(m.agentPct, 18)} ${String(m.agentPct).padStart(5)}%`);
    }
  }

  out.push('');
  out.push(C.dim('  Floor, not an estimate. Squash merges strip trailers — real share is higher.'));
  out.push('');
  return out.join('\n');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0]);
    return;
  }

  const target = resolveTarget(opts.target);
  const scanOpts = { limit: opts.limit, since: opts.since };

  let report;
  try {
    if (target.kind === 'remote') {
      if (!opts.json) process.stderr.write(C.dim('  cloning metadata…\n'));
      report = await scanRemote(target.url, scanOpts);
    } else {
      report = scanLocal(target.path, scanOpts);
    }
  } catch (err) {
    console.error('\n  Scan failed: ' + err.message.split('\n')[0] + '\n');
    process.exit(1);
  }

  console.log(opts.json ? JSON.stringify(report, null, 2) : render(report));
}

main();
