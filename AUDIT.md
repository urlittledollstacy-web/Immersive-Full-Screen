# Deep audit request

Please perform a deep audit of this repository before any code changes are made.

## Project
This is a userscript that uses the Web Fullscreen API to provide immersive fullscreen on Android browsers without black bars.

## Primary real-world bug
The upstream project has a reported issue where immersive mode works the first time, but after exiting fullscreen and entering it again, a black bar returns.

## Audit scope
Inspect the entire repository and focus on:
- black bars after fullscreen is exited and re-entered
- fullscreen state restoration
- asynchronous requestFullscreen() lifecycle and promise handling
- fullscreenchange event ordering and races
- orientation changes while entering/exiting fullscreen
- Android Chromium/WebView behavior
- Android Firefox behavior
- viewport and safe-area/inset handling
- 100dvh / 100dvw behavior
- viewport meta-tag mutation and restoration
- preservation of pre-existing page styles and metadata
- repeated enter/exit cycles
- fullscreen rejection/cancellation/permission failures
- DOM readiness and document.body availability
- duplicated listeners
- stale state
- arbitrary timeout-based synchronization
- keyboard/IME interactions
- back gesture/navigation interactions
- layout shifts
- compatibility problems across Chromium/Firefox
- memory leaks
- sites with aggressive CSS/layout systems
- interaction with existing fullscreen implementations on pages

## For every significant finding
Report:
1. Exact file and location.
2. Severity.
3. Concrete failure scenario.
4. Technical root cause.
5. Recommended fix.
6. Browser/platform affected.
7. Whether the problem is deterministic or timing-dependent.

Also inspect repository history and existing issues for related fullscreen/black-bar regressions.

Do not make speculative code changes. Audit first.
