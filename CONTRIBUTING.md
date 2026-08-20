# Contributing

The most useful contribution is a **missing or wrong signature**.

## Adding an agent

Every rule lives in [`src/signatures.js`](src/signatures.js). To add one, open
an issue or PR with a link to a public commit showing the signature — a real
example, not a description. Rules must be deterministic: a literal trailer,
footer, or bot identity the tool writes about itself.

Style analysis, perplexity scoring and other inference are out of scope. They
do not work reliably on code, and a single confident false positive would cost
more credibility than the feature is worth.

## Reporting a wrong number

Open an issue with the repository, the command you ran, and what you expected.
Methodology criticism is welcome and there is a documented history of it —
see [`docs/CORRECTIONS.md`](docs/CORRECTIONS.md).

## Things that will not be added

**Per-contributor breakdowns.** No flag, no opt-in, no local-only exception.
The information is already in `git log`, but a tool that packages it into a
ranked report removes the friction that stops people acting on it, and that
report ends up in front of someone's manager.

## Tests

```bash
npm test
```

Detection changes need a test built from a real commit shape. `test/detection.test.js`
has examples to follow.
