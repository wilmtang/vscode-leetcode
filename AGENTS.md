# AGENTS.md

Guidance for AI agents (and humans) working in this repo. Read this before doing
a code review or security audit so you don't re-report decisions that are
intentional.

## Build & test

- `npm run compile` — type-check + emit (`tsc -p ./`).
- `npm test` — compiles `tsconfig.test.json` then runs the **offline** unit suite
  (mappers, renderer/XSS cases, solution-file round-trips). Must stay green.
- Integration tests (`src/test/integration/*.live.ts`) hit the live LeetCode API
  and need a real synced session; they are not part of `npm test`.

## Audit history

- `docs/maintainer-guide.md` has the consolidated audit notes, current caveats,
  live-test workflow, and release workflow.

When you finish an audit, append concise findings to `docs/maintainer-guide.md`
unless the audit is large enough to justify a separate file. Note fixes in
`CHANGELOG.md`.

## Known intentional design decisions — do NOT flag as bugs

These have been reviewed and are deliberate. Re-raising them as defects is noise;
if you believe one is now wrong, argue the *change*, don't list it as a finding.

### 1. The auth-sync HTTP listener accepts no-`Origin` POSTs without a secret (audit 2 / A2-2)

`src/auth/authSyncServer.ts` runs a loopback-only listener (`127.0.0.1`) that the
companion browser extension pushes the LeetCode session cookie to. By design:

- `leetcode.authSync.secret` is **empty by default** ("zero-config local sync"),
  so a request with no `Origin` header is accepted on the strength of carrying a
  valid `LEETCODE_SESSION` cookie.
- Cross-site browser requests are still rejected (the `Origin` allow-list blocks
  any web page, which always sends `Origin` on cross-origin POSTs), and CORS
  responses are only reflected to extension/loopback origins.

The residual exposure — *another local process* on the same machine could POST a
cookie — is an accepted trade-off for zero-config UX. The mitigation is offered,
not forced: users who don't trust local processes set `leetcode.authSync.secret`
(and the extension echoes it via `X-LeetCode-AuthSync-Secret`). **Do not** propose
making the secret mandatory or auto-generating one as a "fix"; treat the secret as
the documented opt-in security boundary.

### 2. `vscode://…?cookie=` URI sign-in ingests a cookie from the deep link (audit 2 / A2-3)

`leetCodeManager.handleUriSignIn` (the "Web Authorization" sign-in option) reads
the cookie from the URI query and signs in with it. This is the legacy web-auth
flow and is intentionally retained alongside auto-sync and manual cookie entry.
The deep-link prompt VS Code shows before invoking the handler is the accepted
user-consent gate. **Do not** flag this as login-CSRF/session-fixation to be
removed; it's a known, opt-in path.

## When auditing, these ARE fair game

Everything else — credential-at-rest handling, the request/HTTP layer, the
webview CSPs and sanitizer, explorer caching, concurrency in the sync server —
is in scope. See `docs/maintainer-guide.md` and `CHANGELOG.md` for current
state.

## Conventions

- `leetcode.cn` support is currently **broken and untested**; CN-only gaps are
  documented, not necessarily fixed. PRs welcome.
- Secrets (session cookie, captured browser request headers) live in
  `context.secrets` (OS keychain), never in `globalState`/Memento. Keep it that way.
