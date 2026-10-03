// ==UserScript==
// @name         Immersive Full Screen Experience
// @version      0.4
// @description  Adds a floating button for immersive full screen without black bars
// @homepageURL  https://github.com/0xArchit/Immersive-Full-Screen
// @author       0xArchit
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const STYLE_PROPERTIES = [
        ['height', 'body'],
        ['width', 'body'],
        ['margin', 'body'],
        ['padding', 'body'],
        ['overflow', 'body'],
        ['overscrollBehavior', 'body'],
        ['height', 'documentElement'],
        ['width', 'documentElement'],
        ['margin', 'documentElement'],
        ['padding', 'documentElement'],
        ['overflow', 'documentElement'],
        ['position', 'documentElement'],
        ['top', 'documentElement'],
        ['left', 'documentElement'],
        ['right', 'documentElement'],
        ['bottom', 'documentElement']
    ];

    let button = null;
    let session = null;
    let orientationTimer = 0;
    let initializationDone = false;

    function clearOrientationTimer() {
        if (orientationTimer) {
            clearTimeout(orientationTimer);
            orientationTimer = 0;
        }
    }

    function isScriptOwnedFullscreen() {
        return Boolean(
            session &&
            session.active &&
            document.fullscreenElement === document.documentElement
        );
    }

    function captureStyleState() {
        return STYLE_PROPERTIES.map(([property, target]) => {
            const element = document[target];
            return {
                element,
                property,
                value: element.style.getPropertyValue(property),
                priority: element.style.getPropertyPriority(property)
            };
        });
    }

    function restoreStyleState(state) {
        if (!state) return;

        for (const item of state) {
            if (item.value) {
                item.element.style.setProperty(item.property, item.value, item.priority);
            } else {
                item.element.style.removeProperty(item.property);
            }
        }
    }

    function captureViewportMeta() {
        const existing = document.querySelector('meta[name="viewport"]');

        if (!existing) {
            return {
                existed: false,
                element: null,
                content: null
            };
        }

        return {
            existed: true,
            element: existing,
            content: existing.getAttribute('content')
        };
    }

    function applyViewportMeta() {
        if (!session) return;

        let meta = session.viewportMeta.element;

        if (!meta || !meta.isConnected) {
            meta = document.querySelector('meta[name="viewport"]');

            if (!meta) {
                meta = document.createElement('meta');
                meta.name = 'viewport';
                document.head.appendChild(meta);
            }

            session.viewportMeta.element = meta;
            session.viewportMeta.created = !session.viewportMeta.existed;
        }

        meta.setAttribute(
            'content',
            'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
        );
    }

    function restoreViewportMeta(viewportMeta) {
        if (!viewportMeta) return;

        const meta = viewportMeta.element;

        if (!viewportMeta.existed) {
            if (meta?.isConnected) {
                meta.remove();
            }
            return;
        }

        if (meta?.isConnected) {
            if (viewportMeta.content === null) {
                meta.removeAttribute('content');
            } else {
                meta.setAttribute('content', viewportMeta.content);
            }
        }
    }

    function applyImmersiveStyles(activeSession) {
        if (!activeSession?.active || session !== activeSession) {
            return;
        }

        const body = document.body;
        const root = document.documentElement;

        if (!body || !root) {
            return;
        }

        body.style.height = '100dvh';
        body.style.width = '100dvw';
        body.style.margin = '0';
        body.style.padding = '0';
        body.style.overflow = 'auto';
        body.style.overscrollBehavior = 'none';

        root.style.height = '100dvh';
        root.style.width = '100dvw';
        root.style.margin = '0';
        root.style.padding = '0';
        root.style.overflow = 'hidden';
        root.style.position = 'fixed';
        root.style.top = '0';
        root.style.left = '0';
        root.style.right = '0';
        root.style.bottom = '0';

        applyViewportMeta();
    }

    function endSession() {
        if (!session) {
            return;
        }

        const finished = session;
        session = null;

        clearOrientationTimer();

        finished.active = false;
        restoreStyleState(finished.styleState);
        restoreViewportMeta(finished.viewportMeta);

        if (button) {
            button.style.display = 'block';
        }
    }

    async function enterFullscreen() {
        if (session || !document.documentElement?.requestFullscreen) {
            return;
        }

        const target = document.documentElement;
        const newSession = {
            id: Symbol('fullscreen-session'),
            active: false,
            target,
            styleState: captureStyleState(),
            viewportMeta: captureViewportMeta()
        };

        session = newSession;

        try {
            await target.requestFullscreen({navigationUI: 'hide'});

            if (
                session !== newSession ||
                document.fullscreenElement !== target
            ) {
                if (session === newSession) {
                    endSession();
                }
                return;
            }

            newSession.active = true;
            applyImmersiveStyles(newSession);

            if (button) {
                button.style.display = 'none';
            }
        } catch (error) {
            if (session === newSession) {
                endSession();
            }

            console.debug('[Immersive Full Screen] Fullscreen request failed:', error);
        }
    }

    function handleFullscreenChange() {
        if (!session) {
            return;
        }

        const activeElement = document.fullscreenElement;

        if (activeElement !== session.target) {
            endSession();
            return;
        }

        if (!session.active) {
            session.active = true;
        }

        applyImmersiveStyles(session);

        if (button) {
            button.style.display = 'none';
        }
    }

    function scheduleOrientationReconcile() {
        clearOrientationTimer();

        if (!isScriptOwnedFullscreen()) {
            return;
        }

        const currentSession = session;

        orientationTimer = setTimeout(() => {
            orientationTimer = 0;

            if (
                session !== currentSession ||
                !isScriptOwnedFullscreen()
            ) {
                return;
            }

            applyImmersiveStyles(currentSession);
        }, 300);
    }

    function createButton() {
        const existing = document.getElementById('immersive-fullscreen-button');

        if (existing) {
            return existing;
        }

        const element = document.createElement('button');
        element.id = 'immersive-fullscreen-button';
        element.type = 'button';
        element.textContent = '🖥️';
        element.setAttribute('aria-label', 'Enter immersive full screen');
        element.setAttribute('title', 'Enter immersive full screen');

        Object.assign(element.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: '2147483647',
            padding: '10px 20px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '16px'
        });

        element.addEventListener('click', () => {
            void enterFullscreen();
        });

        document.body.appendChild(element);
        return element;
    }

    function initialize() {
        if (initializationDone || !document.body || !document.documentElement) {
            return;
        }

        initializationDone = true;
        button = createButton();

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        window.addEventListener(
            'orientationchange',
            scheduleOrientationReconcile,
            {passive: true}
        );

        if (document.fullscreenElement === document.documentElement) {
            button.style.display = 'none';
        }
    }

    if (document.body) {
        initialize();
    } else {
        document.addEventListener('DOMContentLoaded', initialize, {once: true});
    }
})();
