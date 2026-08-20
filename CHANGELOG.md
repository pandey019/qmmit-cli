# Changelog

## 0.2.0

**Restructured into a proper package.** Source split into `src/` modules, CLI
moved to `bin/`, 23 tests added under `test/`, CI across Node 18/20/22.

- Added assisted vs autonomous split. A matched commit usually carries a human
  author with an agent co-author trailer — the agent ran `git commit` during a
  session. Only a small minority have a bot identity as the author. Reporting
  these as one number was misleading; they are now separate.
- Timeline groups by committer date rather than author date, so it agrees with
  what `--since` filters on.
- Reports `lowActivity` when fewer than 100 commits fall in the window.
- `remoteExists()` fails fast on missing repositories instead of hanging on a
  git credential prompt.

## 0.1.1

- Linked repository and issues metadata.

## 0.1.0

- Initial release. Deterministic agent signature detection, CI bot exclusion by
  the `[bot]` convention, concentration reporting, blobless clone reading.
