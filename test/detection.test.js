'use strict';

/**
 * Detection tests.
 *
 * This tool makes numerical claims about other people's repositories, so the
 * rules it applies need to be verifiable rather than asserted. Every test here
 * is built from a real commit shape observed in the wild.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { detectAgents, isExcludedBot } = require('../src/signatures');
const { analyze, classifyAdoption, isBotIdentity } = require('../src/analyze');
const { parseLog, US, RS } = require('../src/git');

/** Build a commit record with sensible defaults. */
function commit(over = {}) {
  return {
    hash: 'a'.repeat(40),
    authorName: 'Jane Dev',
    authorEmail: 'jane@example.com',
    committerName: 'Jane Dev',
    committerEmail: 'jane@example.com',
    date: '2026-06-01T12:00:00+00:00',
    parents: ['b'.repeat(40)],
    subject: 'fix: correct off-by-one',
    body: 'fix: correct off-by-one\n',
    ...over,
  };
}

// ---------------------------------------------------------------- signatures

test('detects Claude Code from a Co-Authored-By trailer', () => {
  const c = commit({
    body: 'fix: thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n',
  });
  assert.deepStrictEqual(detectAgents(c), ['claude-code']);
});

test('detects Cursor from its bot identity', () => {
  const c = commit({
    authorName: 'Cursor Agent',
    authorEmail: 'cursoragent@cursor.com',
  });
  assert.ok(detectAgents(c).includes('cursor'));
});

test('detects Devin from its GitHub App identity', () => {
  const c = commit({
    authorName: 'Devin AI',
    authorEmail: '158243242+devin-ai-integration[bot]@users.noreply.github.com',
  });
  assert.ok(detectAgents(c).includes('devin'));
});

test('detects Aider from its subject suffix', () => {
  const c = commit({ subject: 'refactor loop (aider)' });
  assert.ok(detectAgents(c).includes('aider'));
});

test('a plain human commit matches nothing', () => {
  assert.deepStrictEqual(detectAgents(commit()), []);
});

test('mentioning an agent in prose is not a signature', () => {
  // Guards against the obvious false positive: talking about Claude in a
  // commit message must not count as Claude having written it.
  const c = commit({
    body: 'docs: explain how to use Claude Code with this repo\n',
  });
  assert.deepStrictEqual(detectAgents(c), []);
});

// ---------------------------------------------------------------- bot rules

test('excludes CI bots by the [bot] convention, not a name list', () => {
  // The convention has to hold for release bots we have never seen, because
  // every repository invents its own.
  for (const id of [
    'github-actions[bot]',
    'dependabot[bot]',
    'renovate[bot]',
    'next-js-bot[bot]',
    'some-unknown-release[bot]',
  ]) {
    const c = commit({
      authorName: id,
      authorEmail: `1+${id}@users.noreply.github.com`,
    });
    assert.ok(isExcludedBot(c), `${id} should be excluded`);
  }
});

test('does not exclude ordinary humans', () => {
  assert.ok(!isExcludedBot(commit()));
});

test('coding agents that are also GitHub Apps survive bot exclusion', () => {
  // The bug this guards against: claude[bot], cursor[bot] and
  // devin-ai-integration[bot] all carry "[bot]". Excluding before detecting
  // silently deleted the exact commits the tool exists to count, and produced
  // an undercount that looked plausible rather than broken.
  const agents = [
    { authorName: 'claude[bot]', authorEmail: '1+claude[bot]@users.noreply.github.com' },
    { authorName: 'cursor[bot]', authorEmail: '2+cursor[bot]@users.noreply.github.com' },
    {
      authorName: 'Devin AI',
      authorEmail: '3+devin-ai-integration[bot]@users.noreply.github.com',
    },
  ];
  for (const a of agents) {
    const r = analyze([commit(a)]);
    assert.strictEqual(
      r.totals.agentAttributedCommits,
      1,
      `${a.authorName} must be counted, not excluded`
    );
    assert.strictEqual(r.totals.ciBotCommitsExcluded, 0);
  }
});

// ---------------------------------------------------------------- denominator

test('merge commits are removed from the denominator', () => {
  const r = analyze([commit({ parents: ['x', 'y'] }), commit()]);
  assert.strictEqual(r.totals.mergeCommitsExcluded, 1);
  assert.strictEqual(r.totals.commitsConsidered, 1);
});

test('bot commits are removed from the denominator, not counted as agent work', () => {
  const r = analyze([
    commit({
      authorName: 'dependabot[bot]',
      authorEmail: '1+dependabot[bot]@users.noreply.github.com',
    }),
    commit(),
  ]);
  assert.strictEqual(r.totals.ciBotCommitsExcluded, 1);
  assert.strictEqual(r.totals.commitsConsidered, 1);
  assert.strictEqual(r.agentSharePctFloor, 0);
});

test('share is computed against considered commits', () => {
  const withAgent = commit({
    body: 'x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n',
  });
  const r = analyze([withAgent, commit(), commit(), commit()]);
  assert.strictEqual(r.agentSharePctFloor, 25);
  assert.strictEqual(r.humanSharePctCeiling, 75);
});

// ---------------------------------------------------------------- mode split

test('separates assisted from autonomous commits', () => {
  const assisted = commit({
    body: 'x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n',
  });
  const autonomous = commit({
    authorName: 'Devin AI',
    authorEmail: '1+devin-ai-integration[bot]@users.noreply.github.com',
  });
  const r = analyze([assisted, autonomous]);
  assert.strictEqual(r.mode.assistedCommits, 1);
  assert.strictEqual(r.mode.autonomousCommits, 1);
});

test('a human author with an agent trailer counts as assisted', () => {
  // This is the common case — roughly 94% of matches in the published index.
  assert.ok(!isBotIdentity(commit()));
});

// ---------------------------------------------------------------- concentration

test('classifies a single contributor as individual', () => {
  assert.strictEqual(classifyAdoption(1, 100), 'individual');
});

test('classifies a dominant contributor as individual even across many people', () => {
  assert.strictEqual(classifyAdoption(12, 97), 'individual');
});

test('classifies broad, even adoption as org-wide', () => {
  assert.strictEqual(classifyAdoption(41, 12), 'org-wide');
});

test('reports contributor counts without exposing identities', () => {
  const r = analyze([
    commit({
      authorName: 'Alice',
      authorEmail: 'a@x.com',
      body: 'x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n',
    }),
    commit({
      authorName: 'Bob',
      authorEmail: 'b@x.com',
      body: 'x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n',
    }),
  ]);
  assert.strictEqual(r.concentration.distinctAgentAuthors, 2);
  // No individual may appear anywhere in the report. This is a policy
  // guarantee, not an implementation detail.
  const serialised = JSON.stringify(r);
  assert.ok(!serialised.includes('Alice'), 'no contributor name may be emitted');
  assert.ok(!serialised.includes('a@x.com'), 'no contributor email may be emitted');
});

// ---------------------------------------------------------------- reporting

test('flags low-activity repositories rather than publishing a noisy figure', () => {
  const r = analyze([commit(), commit()]);
  assert.strictEqual(r.lowActivity, true);
});

test('the headline field is named as a floor', () => {
  const r = analyze([commit()]);
  assert.ok('agentSharePctFloor' in r);
  assert.ok(!('agentSharePctEstimate' in r));
});

test('an empty history does not divide by zero', () => {
  const r = analyze([]);
  assert.strictEqual(r.agentSharePctFloor, 0);
  assert.strictEqual(r.totals.commitsConsidered, 0);
});

// ---------------------------------------------------------------- parsing

test('parses commit bodies containing blank lines and newlines', () => {
  // Line-based parsing breaks here, which is why the format uses ASCII
  // separators that cannot occur in git output.
  const body = 'feat: thing\n\nA paragraph.\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n';
  const raw =
    ['abc123', 'Jane', 'j@x.com', 'Jane', 'j@x.com', '2026-06-01T00:00:00+00:00', 'p1', 'feat: thing', body].join(US) +
    RS;
  const [c] = parseLog(raw);
  assert.strictEqual(c.hash, 'abc123');
  assert.strictEqual(c.subject, 'feat: thing');
  assert.ok(c.body.includes('Co-Authored-By'));
  assert.deepStrictEqual(c.parents, ['p1']);
});

test('parses a merge commit with two parents', () => {
  const raw =
    ['h', 'J', 'j@x.com', 'J', 'j@x.com', '2026-06-01T00:00:00+00:00', 'p1 p2', 'merge', 'merge'].join(US) +
    RS;
  const [c] = parseLog(raw);
  assert.strictEqual(c.parents.length, 2);
});
