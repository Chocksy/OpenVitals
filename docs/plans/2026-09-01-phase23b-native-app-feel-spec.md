# Phase 23b: sign in natively, one navigation — a normal iOS app

Owner feedback after installing (2026-09-01): the webview sign-in zooms
and acts weird; the Today tab shows two navigations (the site's nav plus
the app's tab bar); "we should just sign in and that is all, after that
this should be a normal iOS app, not some weird middle thing." Sync was
never broken server-side — both endpoints answer 401 on prod — the
person just never got a session because sign-in was the broken step.

## 1. Native sign-in, webview login deleted

The server has better-auth `emailAndPassword` enabled, so `POST
/api/auth/sign-in/email` with `{ email, password }` returns the session
`Set-Cookie`. In the app:

- A plain SwiftUI form (email, password, Sign in, error line). URLSession
  with a cookie-accepting configuration stores the cookie in
  `HTTPCookieStorage.shared`.
- Push the cookie INTO the webview too: copy every cookie for the base
  URL into `WKWebsiteDataStore.default().httpCookieStore` before the
  Today webview loads, so the site is signed in without ever showing its
  login page. (This is the reverse of the current bridge; keep the
  webview→native direction as well so a re-login on the web side still
  syncs back.)
- Sign out: `POST /api/auth/sign-out`, clear both cookie stores.
- Delete the login sheet and any path that shows the site's `/login`
  inside the app. Google sign-in is out of scope (owner uses
  email+password from 1Password); note it in the Sync tab footer if the
  server has Google configured.

## 2. One navigation: the site hides its chrome inside the app

The app's tab bar is the only navigation. The webview sets a custom
user agent suffix ` OpenVitalsiOS/1` (`WKWebView.customUserAgent` =
default UA + suffix). In `apps/simple`:

- `app/(app)/layout.tsx` reads the `user-agent` header; when it contains
  `OpenVitalsiOS`, render no `TopNav` (no top bar, no mobile bottom bar)
  and drop the bottom padding that exists for the bar.
- The composer must survive: the floating "+" button renders in app mode
  (it already exists as the desktop fixed button; make sure it shows
  when the bottom bar is absent, on every page).
- Everything else stays: the pages themselves are the app's content.
  In-app navigation happens through the page's own links (cards,
  ledger); the site's four destinations are reachable from Home's
  content links, which is enough for v1 — the owner asked for less
  chrome, not more tabs.

## 3. The zoom fix, for any remaining form

iOS zooms a focused input whose font-size is under 16 px. Two belts:
inject a `WKUserScript` (at document start, all frames) that pins the
viewport `maximum-scale=1` in app mode, and check the site's inputs:
any Tailwind text class under 16 px on `input`/`select`/`textarea` used
on mobile gets bumped to 16 px in app mode (a `[data-app]`/UA-gated CSS
rule in `globals.css` is fine). The composer textarea is the one that
matters.

## 4. Verification

- Server: typecheck, tests unchanged or higher; dev-server check with a
  spoofed UA (`curl -A "... OpenVitalsiOS/1" localhost:3001` after
  login) showing the nav markup absent while a normal UA keeps it;
  screenshot both to `/tmp/p23b/`.
- iOS: `xcodebuild build` and `xcodebuild test` green (extend the tests:
  sign-in request encoding, cookie push helper via a seam, UA suffix
  constant); simulator screenshots: the native sign-in form, Today
  without the site chrome (sign in against the LIVE
  https://vitals.chocksy.com with throwaway credentials? No — do not
  create prod accounts; run against the local dev server on the LAN or
  just screenshot signed-out state and state plainly what needs the
  owner's device).
- Report: files changed, endpoint shapes used, what still needs the
  owner (rebuild in Xcode, sign in once natively).
