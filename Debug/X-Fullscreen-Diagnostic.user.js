// ==UserScript==
// @name         X Fullscreen Diagnostic
// @namespace    x-fullscreen-debug
// @version      1.0.0
// @description  Phone-friendly diagnostic for X Home fullscreen timeline failures.
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';

    if (window.top !== window) return;

    const host = location.hostname.toLowerCase();
    if (
        host !== 'x.com' &&
        !host.endsWith('.x.com') &&
        host !== 'twitter.com' &&
        !host.endsWith('.twitter.com')
    ) return;

    const STATE = {
        snapshots: [],
        scrollEvents: [],
        fullscreenChanges: [],
        route: location.href,
        panel: null,
        output: null,
        observer: null,
        lastScrollEventAt: 0
    };

    const MAX_SNAPSHOTS = 40;
    const MAX_SCROLL_EVENTS = 80;

    const now = () => new Date().toISOString();

    function safeNumber(value) {
        return Number.isFinite(value) ? Math.round(value * 100) / 100 : value;
    }

    function getTweetInfo() {
        const tweets = Array.from(
            document.querySelectorAll('article[data-testid="tweet"]')
        );

        let visible = 0;
        let belowViewport = 0;
        let aboveViewport = 0;
        const viewportHeight = window.innerHeight || 0;

        for (const tweet of tweets) {
            const rect = tweet.getBoundingClientRect();

            if (rect.bottom > 0 && rect.top < viewportHeight) visible++;
            if (rect.top >= viewportHeight) belowViewport++;
            if (rect.bottom <= 0) aboveViewport++;
        }

        return {
            totalTweetArticles: tweets.length,
            visibleTweetArticles: visible,
            belowViewportTweetArticles: belowViewport,
            aboveViewportTweetArticles: aboveViewport
        };
    }

    function getSnapshot(label) {
        const root = document.documentElement;
        const body = document.body;
        const scrollingElement = document.scrollingElement;
        const vv = window.visualViewport;

        return {
            time: now(),
            label,
            url: location.href,
            fullscreenElement: document.fullscreenElement?.tagName ?? null,
            scrollingElement: scrollingElement?.tagName ?? null,
            scrollY: safeNumber(window.scrollY),
            documentScrollTop: safeNumber(scrollingElement?.scrollTop),
            bodyScrollTop: safeNumber(body?.scrollTop),
            innerHeight: safeNumber(window.innerHeight),
            innerWidth: safeNumber(window.innerWidth),
            rootClientHeight: safeNumber(root?.clientHeight),
            rootClientWidth: safeNumber(root?.clientWidth),
            visualHeight: safeNumber(vv?.height),
            visualWidth: safeNumber(vv?.width),
            visualOffsetTop: safeNumber(vv?.offsetTop),
            visualOffsetLeft: safeNumber(vv?.offsetLeft),
            htmlOverflowY: root ? getComputedStyle(root).overflowY : null,
            htmlOverflowX: root ? getComputedStyle(root).overflowX : null,
            bodyOverflowY: body ? getComputedStyle(body).overflowY : null,
            bodyOverflowX: body ? getComputedStyle(body).overflowX : null,
            ...getTweetInfo()
        };
    }

    function recordSnapshot(label) {
        STATE.snapshots.push(getSnapshot(label));

        if (STATE.snapshots.length > MAX_SNAPSHOTS) {
            STATE.snapshots.shift();
        }

        render();
    }

    function onScroll(event) {
        const timestamp = performance.now();

        if (timestamp - STATE.lastScrollEventAt < 100) return;
        STATE.lastScrollEventAt = timestamp;

        const target =
            event.target === document
                ? document.scrollingElement
                : event.target;

        STATE.scrollEvents.push({
            time: now(),
            tag: target?.tagName ?? null,
            id: target?.id || null,
            className:
                typeof target?.className === 'string'
                    ? target.className.slice(0, 160)
                    : null,
            scrollTop: safeNumber(target?.scrollTop),
            scrollLeft: safeNumber(target?.scrollLeft)
        });

        if (STATE.scrollEvents.length > MAX_SCROLL_EVENTS) {
            STATE.scrollEvents.shift();
        }

        render();
    }

    function onFullscreenChange() {
        STATE.fullscreenChanges.push({
            time: now(),
            fullscreenElement:
                document.fullscreenElement?.tagName ?? null,
            url: location.href
        });

        recordSnapshot(
            document.fullscreenElement
                ? 'fullscreenchange: entered'
                : 'fullscreenchange: exited'
        );
    }

    function buttonStyle() {
        return [
            'border:1px solid rgba(255,255,255,.35)',
            'border-radius:8px',
            'padding:6px 8px',
            'background:#222',
            'color:#fff',
            'font:12px sans-serif'
        ].join(';');
    }

    function createPanel() {
        if (STATE.panel) return;

        const panel = document.createElement('div');

        panel.style.cssText = [
            'position:fixed',
            'left:8px',
            'right:8px',
            'bottom:8px',
            'z-index:2147483647',
            'background:rgba(0,0,0,.92)',
            'color:#fff',
            'border:1px solid rgba(255,255,255,.25)',
            'border-radius:12px',
            'padding:10px',
            'box-sizing:border-box',
            'max-height:42vh',
            'overflow:hidden',
            'font:12px/1.4 monospace',
            'touch-action:manipulation'
        ].join(';');

        const title = document.createElement('div');
        title.textContent = 'X Fullscreen Diagnostic';
        title.style.cssText =
            'font:bold 14px sans-serif;margin-bottom:8px';

        const controls = document.createElement('div');
        controls.style.cssText =
            'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px';

        const snapshotButton = document.createElement('button');
        snapshotButton.textContent = 'Snapshot';
        snapshotButton.style.cssText = buttonStyle();
        snapshotButton.addEventListener('click', () => {
            recordSnapshot('manual');
        });

        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copy report';
        copyButton.style.cssText = buttonStyle();
        copyButton.addEventListener('click', async () => {
            const report = buildReport();

            try {
                await navigator.clipboard.writeText(report);
            } catch {
                const area = document.createElement('textarea');
                area.value = report;
                area.style.position = 'fixed';
                area.style.opacity = '0';
                document.body.appendChild(area);
                area.select();
                document.execCommand('copy');
                area.remove();
            }

            copyButton.textContent = 'Copied ✓';
            setTimeout(() => {
                copyButton.textContent = 'Copy report';
            }, 1200);
        });

        const clearButton = document.createElement('button');
        clearButton.textContent = 'Clear';
        clearButton.style.cssText = buttonStyle();
        clearButton.addEventListener('click', () => {
            STATE.snapshots.length = 0;
            STATE.scrollEvents.length = 0;
            STATE.fullscreenChanges.length = 0;
            recordSnapshot('cleared');
        });

        const hideButton = document.createElement('button');
        hideButton.textContent = 'Hide';
        hideButton.style.cssText = buttonStyle();
        hideButton.addEventListener('click', () => {
            panel.style.display =
                panel.style.display === 'none' ? 'block' : 'none';
        });

        controls.append(
            snapshotButton,
            copyButton,
            clearButton,
            hideButton
        );

        const output = document.createElement('pre');
        output.style.cssText = [
            'margin:0',
            'white-space:pre-wrap',
            'word-break:break-word',
            'max-height:30vh',
            'overflow:auto'
        ].join(';');

        panel.append(title, controls, output);
        document.documentElement.appendChild(panel);

        STATE.panel = panel;
        STATE.output = output;

        render();
    }

    function buildReport() {
        return JSON.stringify(
            {
                generatedAt: now(),
                userAgent: navigator.userAgent,
                routeAtStart: STATE.route,
                currentUrl: location.href,
                snapshots: STATE.snapshots,
                scrollEvents: STATE.scrollEvents,
                fullscreenChanges: STATE.fullscreenChanges
            },
            null,
            2
        );
    }

    function render() {
        if (!STATE.output) return;

        const current =
            STATE.snapshots.at(-1) || getSnapshot('live');

        STATE.output.textContent = [
            'URL: ' + current.url,
            'FS: ' + (current.fullscreenElement ?? 'none'),
            'scrollY: ' + current.scrollY,
            'docScrollTop: ' + current.documentScrollTop,
            'bodyScrollTop: ' + current.bodyScrollTop,
            'inner: ' + current.innerWidth + 'x' + current.innerHeight,
            'root: ' +
                current.rootClientWidth +
                'x' +
                current.rootClientHeight,
            'visual: ' +
                current.visualWidth +
                'x' +
                current.visualHeight +
                ' @' +
                current.visualOffsetTop +
                ',' +
                current.visualOffsetLeft,
            'overflow: html=' +
                current.htmlOverflowY +
                ', body=' +
                current.bodyOverflowY,
            'tweets: total=' +
                current.totalTweetArticles +
                ', visible=' +
                current.visibleTweetArticles +
                ', below=' +
                current.belowViewportTweetArticles +
                ', above=' +
                current.aboveViewportTweetArticles,
            '',
            'snapshots: ' + STATE.snapshots.length,
            'scroll events: ' + STATE.scrollEvents.length,
            'fullscreen changes: ' + STATE.fullscreenChanges.length
        ].join('\n');
    }

    function installObservers() {
        document.addEventListener('scroll', onScroll, true);
        document.addEventListener(
            'fullscreenchange',
            onFullscreenChange,
            true
        );

        STATE.observer = new MutationObserver(() => {
            const path = location.pathname;

            if (path === '/home' || path.startsWith('/search')) {
                render();
            }
        });

        STATE.observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    function start() {
        if (!document.documentElement || !document.body) {
            requestAnimationFrame(start);
            return;
        }

        createPanel();
        installObservers();
        recordSnapshot('initial');
    }

    start();

    window.XFullscreenDiagnostic = {
        snapshot: recordSnapshot,
        report: buildReport,

        destroy() {
            document.removeEventListener('scroll', onScroll, true);
            document.removeEventListener(
                'fullscreenchange',
                onFullscreenChange,
                true
            );
            STATE.observer?.disconnect();
            STATE.panel?.remove();
            delete window.XFullscreenDiagnostic;
        }
    };
})();