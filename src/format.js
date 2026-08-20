'use strict';

/** Terminal rendering. Kept apart from analysis so the report stays portable. */

function makeColor(enabled) {
  const wrap = (code, s) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : s);
  return {
    bold: (s) => wrap(1, s),
    dim: (s) => wrap(2, s),
    cyan: (s) => wrap(36, s),
    yellow: (s) => wrap(33, s),
  };
}

function bar(pct, width = 28, dim = (s) => s) {
  const filled = Math.round((pct / 100) * width);
  return '█'.repeat(filled) + dim('░'.repeat(width - filled));
}

const PATTERN_LABEL = {
  individual: 'individual  (one person driving this)',
  team: 'team  (a small group)',
  'org-wide': 'org-wide  (broad adoption)',
  none: 'none',
};

function render(r, { color = true } = {}) {
  const C = makeColor(color);
  const t = r.totals;
  const out = [''];

  out.push(C.bold('  qmmit') + C.dim('  ·  agent-authorship report'));
  out.push('');
  out.push(
    `  ${C.bold(C.cyan(r.agentSharePctFloor + '%'))} of commits are provably agent-authored ` +
      C.dim('(floor)')
  );
  out.push(`  ${bar(r.agentSharePctFloor, 28, C.dim)}`);
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
    out.push('');
    out.push(C.bold('  Adoption pattern: ') + C.cyan(PATTERN_LABEL[c.adoptionPattern]));
    out.push(
      C.dim(
        `    ${c.distinctAgentAuthors} distinct contributor` +
          `${c.distinctAgentAuthors === 1 ? '' : 's'}` +
          `  ·  top one accounts for ${c.topAuthorShareOfAgentCommits}% of agent commits`
      )
    );
    out.push(
      C.dim(
        `    ${r.mode.assistedCommits} assisted (human authored)  ·  ` +
          `${r.mode.autonomousCommits} autonomous (bot authored)`
      )
    );
  }

  if (r.lowActivity) {
    out.push('');
    out.push(
      C.yellow(
        `  ! Only ${t.commitsConsidered} commits considered — percentage is noisy, do not publish.`
      )
    );
  }

  if (r.agents.length) {
    out.push('');
    out.push(C.bold('  Agents detected'));
    for (const a of r.agents) {
      out.push(
        `    ${a.label.padEnd(20)} ${String(a.commits).padStart(6)} commits  ${C.dim(
          a.sharePct + '%'
        )}`
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
      out.push(
        `    ${m.month}  ${bar(m.agentPct, 18, C.dim)} ${String(m.agentPct).padStart(5)}%`
      );
    }
  }

  out.push('');
  out.push(
    C.dim('  Floor, not an estimate. Squash merges strip trailers — real share is higher.')
  );
  out.push('');
  return out.join('\n');
}

module.exports = { render, bar, makeColor };
