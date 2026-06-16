# User Profile Panel (Status Bar Click)

The `LeetCode: <username>` status bar item opens a personal-stats panel for the
signed-in user. This document explains what the panel shows, which LeetCode
GraphQL queries back it, and where the relevant code lives.

## What the Panel Shows

- **Total solved**: a big "Solved N / M" number, plus three per-difficulty
  progress bars (`Easy`, `Medium`, `Hard`) sized against the full catalog.
- **Beats %**: the same percentile pills LeetCode shows on the public profile
  page (`Beats Easy: 99.8%`, etc.).
- **About**: country, company, school, global ranking, and reputation when
  LeetCode returns them.
- **Languages**: solved-problem count per language, ranked desc and capped at 8.
- **Recent Accepted**: the 10 most recent AC submissions with relative
  timestamps and a direct link to each problem.

The panel is the only entry point bound to the status bar click while signed
in. The command is also reachable from the command palette as
`LeetCode: Show User Profile`. When signed out, the status bar click falls
through to the standard sign-in picker (the same as clicking `Sign In` in the
side bar).

## Backing GraphQL Queries

The panel composes the same four queries that drive `leetcode.com/u/<user>/`
and `leetcode.com/progress/`. All hit `POST /graphql/` on the active endpoint
with the synced `LEETCODE_SESSION` + `csrftoken` cookies.

| Operation                       | Purpose                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `userPublicProfile`             | Username, real name, avatar, ranking, country, company, school, reputation.        |
| `userProblemsSolved`            | Catalog totals (`allQuestionsCount`) + AC counts per difficulty + Beats percentiles.|
| `recentAcSubmissions`           | Last 15 Accepted submissions (id, title, slug, timestamp). Sliced to 10 in the UI. |
| `languageStats`                 | Solved-problem count per language (`languageProblemCount`).                        |

All four are fired in parallel from `fetchUserProfile()`; a single transient
failure degrades to an empty section in the panel instead of breaking the whole
view. Errors are logged to the LeetCode output channel for triage.

## Code Map

| Concern                                                              | File                                                |
| -------------------------------------------------------------------- | --------------------------------------------------- |
| GraphQL calls + mapping (`fetchUserProfile`, `mapUserProfile`)       | `src/request/leetcode-api.ts`                       |
| Command entry point (`leetcode.showUserProfile`)                     | `src/commands/profile.ts`                           |
| Webview renderer                                                     | `src/webview/leetCodeProfileProvider.ts`            |
| Status bar wiring (`signed-in → showUserProfile`, `signed-out → signin`) | `src/statusbar/LeetCodeStatusBarItem.ts`            |
| Command registration in the extension manifest                       | `package.json` (`contributes.commands`)             |
| Pure-mapper unit tests                                               | `src/test/request/leetcode-api.mappers.test.ts`     |
| Live integration test (skipped without an auth fixture)              | `src/test/integration/leetcode-api.live.ts`         |

## Why a Pure Mapper

`mapUserProfile()` is exported and exercised in unit tests so the response-
parsing logic can be regression-tested offline without an auth fixture. The
fixture file `src/test/fixtures/leetcode-responses.ts` captures the live shape
of each GraphQL payload so the mapper stays honest as LeetCode evolves the
schema.

The mapper also normalizes some quirks:

- The `userProblemsSolved` payload sometimes omits the `All` rollup. The
  mapper synthesizes it from `Easy + Medium + Hard` so the webview can read
  `solvedByDifficulty[0]` unconditionally.
- Beats entries with unknown difficulty labels are dropped (forward-compat).
- Language entries with zero counts are filtered before sorting.
- `recentAcSubmissionList` timestamps come back as strings; the mapper
  normalizes them to numbers (unix seconds).

## Running the Tests

```bash
npm test                       # 38 unit tests, no network, no auth.
npm run test:integration       # Live; needs src/test/.secrets/leetcode-auth.local.json.
```

See `src/test/integration/README.md` for capturing an auth fixture.
