// ==UserScript==
// @name         Immersive Full Screen Experience
// @version      0.5
// @description  Adds a floating button for immersive full screen without black bars
// @homepageURL  https://github.com/0xArchit/Immersive-Full-Screen
// @author       0xArchit
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const ROOT_STYLE_PROPERTIES = [
        'height', 'width', 'margin', 'padding', 'overflow',
        'position', 'top', 'left', 'right', 'bottom'
    ];

    const BODY_STYLE_PROPERTIES = [
        'height', 'width', 'margin', 'padding', 'overflow', 'overscroll-behavior'
    ];

    const IMMERSIVE_STYLES = {
        body: {
            height: '100dvh',
            width: '100dvw',
            margin: '0',
            padding: '0',
            overflow: 'auto',
            'overscroll-behavior': 'none'
        },
        root: {
            height: '100dvh',
            width: '100dvw',
            margin: '0',
            padding: '0',
            overflow: 'hidden',
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0'
        }
    };

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

    function snapshotStyles(element, properties) {
        if (!element) return null;

        return {
            element,
            properties: properties.map(property => ({
                property,
                value: element.style.getPropertyValue(property),
                priority: element.style.getPropertyPriority(property),
                present: element.style.getPropertyValue(property) !== ''
            }))
        };
    }

    function restoreStyles(snapshot) {
        if (!snapshot?.element) return;

        for (const item of snapshot.properties) {
            if (item.present) {
                snapshot.element.style.setProperty(
                    item.property,
                    item.value,
                    item.priority
                );
            } else {
                snapshot.element.style.removeProperty(item.property);
            }
        }
    }

    function setOwnedStyles(sessionState, target, styles) {
        if (!sessionState || !target) return;

        if (!sessionState.modifiedElements.includes(target)) {
            const properties = target === document.documentElement
                ? ROOT_STYLE_PROPERTIES
                : BODY_STYLE_PROPERTIES;

            sessionState.snapshots.push(snapshotStyles(target, properties));
            sessionState.modifiedElements.push(target);
        }

        for (const [property, value] of Object.entries(styles)) {
            target.style.setProperty(property, value);
        }
    }

    function captureViewportMeta() {
        const element = document.querySelector('meta[name="viewport"]');

        if (!element) {
            return {
                element: null,
                existed: false,
                content: null
            };
        }

        return {
            element,
            existed: true,
            content: element.getAttribute('content')
        };
    }

    function ensureViewportMeta(sessionState) {
        if (!sessionState) return null;

        const current = sessionState.viewportMeta;

        if (current.element?.isConnected) {
            current.lastOwnedElement = current.element;
            return current.element;
        }

        // Never adopt a page-replaced node after the original element was lost.
        if (!current.existed && current.createdElement?.isConnected) {
            current.lastOwnedElement = current.createdElement;
            return current.createdElement;
        }

        const existing = document.querySelector('meta[name="viewport"]');

        if (existing) {
            return null;
        }

        const created = document.createElement('meta');
        created.name = 'viewport';
        created.setAttribute(
            'content',
            'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
        );
        document.head.appendChild(created);

        current.createdElement = created;
        current.lastOwnedElement = created;
        return created;
    }

    function applyViewportMeta(sessionState) {
        const meta = ensureViewportMeta(sessionState);
        if (!meta) return;

        meta.setAttribute(
            'content',
            'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
        );
    }

    function restoreViewportMeta(viewportState) {
        if (!viewportState) return;

        if (viewportState.existed) {
            const original = viewportState.element;

            if (original?.isConnected) {
                if (viewportState.content === null) {
                    original.removeAttribute('content');
                } else {
                    original.setAttribute('content', viewportState.content);
                }
            }
            return;
        }

        // Remove only the node this script created. Never remove a page-owned replacement.
        if (viewportState.createdElement?.isConnected) {
            viewportState.createdElement.remove();
        }
    }

    function applyImmersiveStyles(activeSession) {
        if (!activeSession?.active || session !== activeSession) return;

        const root = document.documentElement;
        const body = document.body;

        if (!root || !body) return;

        setOwnedStyles(activeSession, body, IMMERSIVE_STYLES.body);
        setOwnedStyles(activeSession, root, IMMERSIVE_STYLES.root);
        applyViewportMeta(activeSession);
    }

    function showButton() {
        if (button) button.style.display = 'block';
    }

    function hideButton() {
        if (button) button.style.display = 'none';
    }

    function endSession() {
        if (!session) return;

        const finished = session;
        session = null;

        clearOrientationTimer();

        finished.active = false;

        for (let i = finished.snapshots.length - 1; i >= 0; i -= 1) {
            restoreStyles(finished.snapshots[i]);
        }

        restoreViewportMeta(finished.viewportMeta);
        showButton();
    }

    async function enterFullscreen() {
        if (session || !document.documentElement?.requestFullscreen) {
            return;
        }

        const target = document.documentElement;

        const pendingSession = {
            id: Symbol('fullscreen-session'),
            target,
            active: false,
            applied: false,
            modifiedElements: [],
            snapshots: [],
            viewportMeta: captureViewportMeta()
        };

        session = pendingSession;

        try {
            await target.requestFullscreen({navigationUI: 'hide'});

            if (session !== pendingSession) {
                return;
            }

            if (document.fullscreenElement !== target) {
                endSession();
                return;
            }

            pendingSession.active = true;
            applyImmersiveStyles(pendingSession);
            pendingSession.applied = true;
            hideButton();
        } catch (error) {
            if (session === pendingSession) {
                // Nothing was applied before requestFullscreen resolved.
                session = null;
                clearOrientationTimer();
                showButton();
            }

            console.debug(
                '[Immersive Full Screen] Fullscreen request failed:',
                error
            );
        }
    }

    function reconcileButtonVisibility() {
        if (document.fullscreenElement) {
            hideButton();
        } else {
            showButton();
        }
    }

    function handleFullscreenChange() {
        if (!session) {
            // Fullscreen may belong to the page, not this script.
            reconcileButtonVisibility();
            return;
        }

        if (document.fullscreenElement !== session.target) {
            endSession();
            reconcileButtonVisibility();
            return;
        }

        if (!session.active) {
            session.active = true;
        }

        applyImmersiveStyles(session);
        session.applied = true;
        hideButton();
    }

    function scheduleOrientationReconcile() {
        clearOrientationTimer();

        if (!session?.active || document.fullscreenElement !== session.target) {
            return;
        }

        const currentSession = session;

        orientationTimer = setTimeout(() => {
            orientationTimer = 0;

            if (
                session !== currentSession ||
                !currentSession.active ||
                document.fullscreenElement !== currentSession.target
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

        reconcileButtonVisibility();
    }

    if (document.body) {
        initialize();
    } else {
        document.addEventListener('DOMContentLoaded', initialize, {once: true});
    }
})();
