# Post-migration audit 2 — profile panel & security pass

> Second-pass audit, focused on the code added **after** the first audit
> ([post-migration-audit.md](post-migration-audit.md)): the user profile panel,
> the session-sync status surfaces, the +600-line profile API, and a deeper
> security review of the local auth-sync server and credential handling.
> Date: 2026-06-17. Branch: `fix/audit-bugfixes`.
>
> Findings here are numbered A2-1 … to keep them distinct from audit 1 (#1–#12).
> Health at time of writing: `tsc -p ./` clean, 38/38 offline unit tests pass.
> Nothing below is a crash or a regression — the items are latent bugs,
> edge cases, and (mostly) security hardening.

## Status at a glance

> **Resolution (2026-06-17).** A2-1, A2-4–A2-13 fixed on `fix/audit-bugfixes`
> (clean `tsc`, 40/40 offline tests). A2-2 and A2-3 reviewed and accepted as
> **intentional** — documented in [AGENTS.md](../AGENTS.md) so future audits don't
> re-flag them. See [CHANGELOG.md](../CHANGELOG.md) for the shipped entries.

| # | Finding | Severity | Status |
|---|---|---|---|
| A2-1 | Session cookie stored in plaintext `globalState`, not `SecretStorage` | 🟠 Medium | ✅ Fixed |
| A2-2 | `/auth/update` accepts unauthenticated **local** POSTs by default (secret off) | 🟠 Medium | 📄 Intentional (AGENTS.md) |
| A2-3 | `vscode://…?cookie=` URI sign-in is a login-CSRF / session-fixation sink | 🟠 Medium | 📄 Intentional (AGENTS.md) |
| A2-4 | Control-token & shared-secret compared with `!==` (not constant-time) | 🟡 Low | ✅ Fixed |
| A2-5 | curl fallback passes cookie/headers as argv (visible in `ps`) | 🟡 Low | ✅ Fixed |
| A2-6 | Untrusted solution markdown: tracking-pixel `img` + `file:` links allowed | 🟡 Low | ✅ Fixed (file:); img documented |
| A2-7 | Profile panel blanks loaded sections on a `markdown.*` setting change | 🟡 Low | ✅ Fixed |
| A2-8 | Observer windows don't live-refresh the "Session Sync" card on a remote sync | ⚪ Minor | ✅ Fixed |
| A2-9 | HTTP-200 Cloudflare challenge skips the curl fallback (contradicts comment) | 🟡 Low | ✅ Fixed |
| A2-10 | `mapCnProblem` omits `questionId` (inconsistent with the other mappers) | ⚪ Minor | ✅ Fixed |
| A2-11 | `runObserverCheck` mutates `mode`/`port` outside the `enqueue` lock | ⚪ Minor | ✅ Fixed |
| A2-12 | `fetchUserProfile` aggregate path is now only reached by tests | ⚪ Info | ✅ Marked test-only |
| A2-13 | `authSync.ownerStaleAfterSeconds` setting is unused | ⚪ Info | ✅ Removed |

Legend: ✅ fixed · ⬜ open · 📄 intentional/documented · ⚪ minor/info

> **A2-6 note.** The `file:` link vector is removed (renderer + sanitizer). The
> broad `img-src https:` is kept **by design**: community solutions legitimately
> embed images from arbitrary hosts, so locking it down would break them. The
> residual tracking-pixel risk (IP/timing leak on view) is accepted and recorded
> here rather than fixed.

---

## Findings

### A2-1 — Session cookie stored in plaintext `globalState` 🟠

**Where.** [globalState.ts](../src/globalState.ts) — `setCookie`/`getCookie`,
`setBrowserRequestHeaders` write to `context.globalState`, a
[`Memento`](https://code.visualstudio.com/api/references/vscode-api#Memento).

**Why it matters.** After the migration the synced cookie (including
`LEETCODE_SESSION`, a bearer of full account access) is the *only* auth artifact,
and it is persisted **unencrypted** — VS Code stores `globalState` in a plaintext
SQLite file (`…/User/globalStorage/state.vscdb`). The captured browser request
headers stored alongside it can include `Authorization`. Any process running as
the user, a synced/backed-up profile, or a shoulder-surfed disk can read a live
session. VS Code ships `context.secrets`
([SecretStorage](https://code.visualstudio.com/api/references/vscode-api#SecretStorage),
OS-keychain backed) for exactly this; the extension uses it nowhere
(`grep context.secrets` → 0 hits).

**Suggested fix.** Move `CookieKey` (and the browser-headers/user-agent blobs) to
`context.secrets`. These are async-only, so `getCookie()` becomes a `Promise`;
the call sites already `await` through `getRequiredCookie()`, so the blast radius
is small. (Not a regression — the old CLI also wrote plaintext to `~/.lc` — but
the migration is the natural moment to fix it.)

### A2-2 — `/auth/update` accepts unauthenticated local POSTs by default 🟠

**Where.** [authSyncServer.ts](../src/auth/authSyncServer.ts) `handleRequest`.
`authSync.secret` defaults to `""`, and when empty the secret check is skipped
(`if (secret) { … }`). The only remaining guard for a no-Origin request is
`hasLeetCodeSessionCookie`.

**Why it matters.** The cross-site Origin check (good — it blocks browser pages,
which always attach `Origin` to cross-origin POSTs) is deliberately bypassed for
requests with **no** `Origin` header, since that is how the extension's service
worker and native clients call in. That means *any* local process can
`POST http://127.0.0.1:17899/auth/update` with an attacker-chosen cookie and
silently repoint the user's extension at a different LeetCode account (session
fixation → the victim's submissions land in the attacker's account, or a phishing
surface). The shared-secret feature that would stop this is **off by default**.

**Suggested fix.** Either generate a random secret on first run and surface it for
the extension to echo (zero-config but authenticated), or bind the trust to the
extension-origin allow-list even when `Origin` is absent. At minimum, document
that `authSync.secret` is the security boundary and recommend setting it.

### A2-3 — `vscode://…?cookie=` URI sign-in is a session-fixation sink 🟠 *(inherited)*

**Where.** [leetCodeManager.ts](../src/leetCodeManager.ts) `handleUriSignIn` reads
`cookie` straight from the deep-link query and feeds it to
`updateSessionFromCookie`; registered via `registerUriHandler` in
[extension.ts](../src/extension.ts).

**Why it matters.** Any web page can invoke
`vscode://<publisher>.<ext>/?cookie=<attacker-session>`. `updateSessionFromCookie`
verifies the cookie belongs to *a* signed-in account, but not to *this user*, so a
victim who approves the deep-link prompt is signed into the attacker's account.
This predates the profile work, but the migration made `updateSessionFromCookie`
the central trust sink for three sign-in paths, so it's worth re-flagging.

**Suggested fix.** After ingesting a deep-link/pasted cookie, confirm with the
user the resolved username before committing (`Successfully signed in as X — was
this you?`), or drop the `vscode://?cookie=` path now that auto-sync + manual
cookie entry exist.

### A2-4 — Non-constant-time token/secret comparison 🟡

**Where.** [authSyncServer.ts](../src/auth/authSyncServer.ts): `providedToken !==
this.controlToken` (`handleRelease`) and `providedSecret !== secret`
(`handleRequest`). `grep timingSafeEqual` → 0 hits.

**Why it matters.** Both are attacker-supplied values compared against secrets
with a short-circuiting `!==`. Over loopback the timing signal is small and the
tokens are long (192-bit control token), so exploitation is impractical — but
it's a cheap, standard hardening gap.

**Suggested fix.** Compare with `crypto.timingSafeEqual` over `Buffer`s of equal
length (guard the length check first).

### A2-5 — curl fallback exposes the cookie in process arguments 🟡

**Where.** [leetcode-http.ts](../src/request/leetcode-http.ts) `executeCurl`
pushes the cookie as `-b <cookie>` and the body as `--data-raw <body>` into
`execFile("curl", args)`.

**Why it matters.** Process argv is world-readable on the host (`ps aux`,
`/proc/<pid>/cmdline`), so during a Cloudflare-fallback request the full session
cookie is briefly visible to other local processes. `execFile` (no shell) already
avoids injection — this is only about argv visibility.

**Suggested fix.** Pass the cookie via `--config -` / stdin (`-H @-` style) or an
env-var header file instead of argv. Lower priority than A2-1/A2-2 since it's
fallback-only and transient.

### A2-6 — Untrusted community-solution markdown: tracking pixels & `file:` links 🟡

**Where.** [leetCodeSolutionProvider.ts](../src/webview/leetCodeSolutionProvider.ts)
renders `getTopSolutionArticle` content (authored by *arbitrary* LeetCode users).
markdown-it runs with `html:false` (raw HTML is escaped — good), and the CSP omits
`'unsafe-inline'` for scripts, so script injection is well-contained. Two gaps
remain: the CSP's `img-src https: data:` lets a solution embed
`![](https://attacker/x.png)` — a beacon that leaks the reader's IP/timing — and
[markdownEngine.ts](../src/webview/markdownEngine.ts) `addLinkValidator` *widens*
`validateLink` to also allow `file:` URLs, so a malicious solution can plant a
`[x](file://attacker-host/share)` link (NTLM-leak risk on Windows).

**Why it matters.** This is the one webview whose body is fully attacker-authored;
the problem-description preview (audit 1 #4) is LeetCode-authored. Severity is low
because scripts can't run, but a tracking pixel + `file:` link on untrusted
content are avoidable.

**Suggested fix.** For the solution webview, scope the `file:` allowance to the
description path only (it's there for LeetCode assets, not community posts), and
consider restricting `img-src` to the LeetCode CDN hosts.

### A2-7 — Profile panel blanks its loaded sections on a `markdown.*` change 🟡

**Where.** [LeetCodeWebview.ts](../src/webview/LeetCodeWebview.ts)
`onDidChangeConfiguration` re-sets `panel.webview.html` whenever any `markdown`
setting changes. [leetCodeProfileProvider.ts](../src/webview/leetCodeProfileProvider.ts)
doesn't override it.

**Why it matters.** The profile panel renders progressively — `open()` paints
skeletons, then `updateIdentity/Stats/Recent/Languages` fill each section via
`postMessage`. An HTML reset regenerates the shell from `this.initial` (header +
sync card only) and re-arms the `ready` handshake, but **nothing re-fetches** the
four network sections, so they revert to skeletons until the user clicks Refresh.
Inherited base behaviour that's fine for the static preview/solution webviews but
wrong for this stateful one. (The same reset on every status-bar reopen is benign
because the command *does* re-fire the four fetches.)

**Suggested fix.** Override `onDidChangeConfiguration` in the profile provider to
no-op (the panel doesn't use markdown styling), or re-trigger
`leetcode.showUserProfile` after a reset so the sections refill.

### A2-8 — Observer windows don't live-refresh the Session Sync card ⚪

**Where.** [authSyncServer.ts](../src/auth/authSyncServer.ts) fires `onDidSync`
(→ status bar + profile card refresh in [extension.ts](../src/extension.ts)) only
in the **owner** window's `handleRequest`. In a non-owner window
`observeSharedAuthSyncState` updates `lastObservedAuthSyncAt` silently and never
emits.

**Why it matters.** With two VS Code windows open, the observer window's open
profile panel shows a stale "Last auth sync" until something else re-renders it.
The status-bar tooltip is unaffected (it's recomputed on hover). Cosmetic.

**Suggested fix.** Have `observeSharedAuthSyncState` fire `onDidSync` when
`lastSyncedAt` advances.

### A2-9 — HTTP-200 Cloudflare challenge skips the curl fallback 🟡

**Where.** [leetcode-http.ts](../src/request/leetcode-http.ts) `requestJson`. The
`isCloudflareChallenge` check is inside `if (response.status !== 200)`, yet the
adjacent comment says CF "occasionally" serves the challenge with a **200**.

**Why it matters.** A 200 challenge page is returned to callers as if it were the
real payload; the downstream JSON parse then fails with a confusing error instead
of transparently retrying via curl (which replays the browser UA/headers and can
pass the challenge).

**Suggested fix.** Run `isCloudflareChallenge(response.data)` before the
`status === 200` happy path and route to curl when it matches.

### A2-10 — `mapCnProblem` omits `questionId` ⚪

**Where.** [leetcode-api.ts](../src/request/leetcode-api.ts) `mapCnProblem`
returns no `questionId`, whereas `mapGlobalProblem` and `mapRestProblem` both set
it. CN is already documented broken (audit 1 #2), so this is only an internal
inconsistency, but it would silently break anything keying on the internal id on
the `leetcode.cn` GraphQL path.

**Suggested fix.** Add `questionId: raw.questionId` (CN list items already select
it) when CN support is revisited.

### A2-11 — `runObserverCheck` mutates `mode`/`port` outside the `enqueue` lock ⚪

**Where.** [authSyncServer.ts](../src/auth/authSyncServer.ts) `runObserverCheck`
runs from a `setInterval` (not via `enqueue`) and writes `this.mode`, `this.port`,
`this.observedOwner`, `this.lastConflict` directly across `await` points, while
`start/stop/forceStart/refreshStatus` mutate the same fields under `enqueue`.

**Why it matters.** A timer tick interleaving with an enqueued transition can
briefly clobber `mode` (e.g. observer-check writes `conflict` just after a
force-start set `local`). It is self-healing on the next heartbeat/observer tick
and the `observerCheckInFlight` guard prevents re-entry, so impact is a transient
wrong status string. Worth tightening for correctness.

**Suggested fix.** Wrap the field writes in `runObserverCheck` in `enqueue`, or
have it return a desired state that an enqueued step applies.

### A2-12 — `fetchUserProfile` aggregate is now test-only ⚪ *(info)*

`commands/profile.ts` fetches the four sections independently
(`fetchProfileIdentity/Stats/Recent/Languages`), so the aggregate
`fetchUserProfile` in [leetcode-api.ts](../src/request/leetcode-api.ts) is reached
only by the live integration test. Harmless (the comment says it's kept for the
aggregate path), but it's dead in production — either wire it somewhere or mark it
clearly as test-support so it isn't mistaken for a live path.

### A2-13 — `authSync.ownerStaleAfterSeconds` is unused ⚪ *(info)*

The setting is declared in [package.json](../package.json) (with a description
already noting it's "legacy compatibility … now verified through /health"), but
`grep ownerStaleAfterSeconds src` → 0 hits. Consider removing it (with a
changelog note) so the settings UI doesn't expose a knob that does nothing.

---

## What's solid (verified this pass)

- **Builds & tests green.** `tsc -p ./` compiles with no errors; all 38 offline
  unit tests pass (mappers, renderer XSS cases, solution-file round-trips).
- **Webview XSS containment.** Preview keeps the audit-1 nonce CSP; the solution
  webview drops `'unsafe-inline'` for scripts and renders markdown with
  `html:false`, and `sanitizeHtml` + KaTeX (`trust` default-off,
  `throwOnError:false`) are layered behind the CSP.
- **Loops & sockets bounded.** Favorites pagination (50-page backstop), judge
  polling (60×1s), the 30 s axios/curl timeout, and `MAX_BODY_BYTES` on the sync
  server are all in place.
- **CSRF posture.** The sync server's cross-site `Origin` rejection + reflected
  CORS only for extension/loopback origins correctly blocks *web* pages (the
  residual gap is local processes — see A2-2).
- **Profile escaping.** Every dynamic value in the profile HTML goes through
  `escapeHtml`/`escapeAttribute`, with a nonce CSP and `default-src 'none'`.

## Suggested priority

1. **A2-1** (plaintext cookie → SecretStorage) and **A2-2** (default-open local
   sync endpoint) — the two that meaningfully expand the credential attack
   surface.
2. **A2-3** (deep-link session fixation) — confirm-username guard.
3. **A2-7 / A2-9** — small, self-contained correctness fixes with visible UX
   payoff.
4. The rest as cleanup.
