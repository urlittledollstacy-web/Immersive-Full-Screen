// ==UserScript==
// @name         Immersive Full Screen Experience
// @version      0.7
// @description  Adds a floating button for immersive full screen without black bars
// @homepageURL  https://github.com/0xArchit/Immersive-Full-Screen
// @author       0xArchit
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const ROOT_STYLE_PROPERTIES = [
        'height', 'width',
        'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'overflow-x', 'overflow-y',
        'position', 'top', 'left', 'right', 'bottom'
    ];

    const BODY_STYLE_PROPERTIES = [
        'height', 'width',
        'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'overflow-x', 'overflow-y',
        'overscroll-behavior-x', 'overscroll-behavior-y'
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
    let pendingRequest = null;
    let orientationTimer = 0;
    let initializationDone = false;
    let bodyObserver = null;

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
                priority: element.style.getPropertyPriority(property)
            }))
        };
    }

    function restoreStyles(snapshot) {
        if (!snapshot?.element) return;

        for (const item of snapshot.properties) {
            if (item.value !== '') {
                snapshot.element.style.setProperty(item.property, item.value, item.priority);
            } else {
                snapshot.element.style.removeProperty(item.property);
            }
        }
    }

    function recordModifiedElement(sessionState, target) {
        if (!sessionState || !target || sessionState.modifiedElements.includes(target)) {
            return;
        }

        const properties = target === document.documentElement
            ? ROOT_STYLE_PROPERTIES
            : BODY_STYLE_PROPERTIES;

        sessionState.snapshots.push(snapshotStyles(target, properties));
        sessionState.modifiedElements.push(target);
    }

    function setOwnedStyles(sessionState, target, styles) {
        if (!sessionState || !target) return;

        recordModifiedElement(sessionState, target);

        for (const [property, value] of Object.entries(styles)) {
            target.style.setProperty(property, value);
        }
    }

    function captureViewportMeta() {
        const element = document.querySelector('meta[name="viewport"]');

        return {
            originalElement: element,
            originalContent: element ? element.getAttribute('content') : null,
            modifiedOriginal: false,
            createdElements: new Set()
        };
    }

    function getOwnedViewportElement(state) {
        if (state.originalElement?.isConnected) {
            return state.originalElement;
        }

        for (const element of state.createdElements) {
            if (element?.isConnected) {
                return element;
            }
        }

        return null;
    }

    function applyViewportMeta(state) {
        if (!state) return;

        let meta = getOwnedViewportElement(state);

        if (!meta) {
            // Never adopt an existing page-owned replacement.
            if (document.querySelector('meta[name="viewport"]')) {
                return;
            }

            if (!document.head) {
                throw new Error('Document head is unavailable.');
            }

            meta = document.createElement('meta');
            meta.name = 'viewport';
            document.head.appendChild(meta);
            state.createdElements.add(meta);
        }

        // Capture the value immediately before the first script-owned write.
        if (meta === state.originalElement && !state.modifiedOriginal) {
            state.originalContent = meta.getAttribute('content');
            state.modifiedOriginal = true;
        }

        meta.setAttribute(
            'content',
            'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
        );
    }

    function restoreViewportMeta(state) {
        if (!state) return;

        if (state.modifiedOriginal && state.originalElement) {
            if (state.originalContent === null) {
                state.originalElement.removeAttribute('content');
            } else {
                state.originalElement.setAttribute('content', state.originalContent);
            }
        }

        for (const element of state.createdElements) {
            element?.remove();
        }
    }

    function applyImmersiveStyles(activeSession) {
        if (!activeSession?.active || session !== activeSession) {
            return;
        }

        const root = document.documentElement;
        const body = document.body;

        if (!root || !body) {
            throw new Error('Document root/body is unavailable.');
        }

        setOwnedStyles(activeSession, body, IMMERSIVE_STYLES.body);
        setOwnedStyles(activeSession, root, IMMERSIVE_STYLES.root);
        applyViewportMeta(activeSession.viewportMeta);
    }

    function createButton() {
        const element = document.createElement('button');
        element.id = 'immersive-fullscreen-button';
        element.type = 'button';
        element.textContent = '🖥️';
        element.setAttribute('aria-label', 'Enter immersive full screen');
        element.setAttribute('title', 'Enter immersive full screen');
        element.dataset.immersiveFullScreenOwned = 'true';

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

        return element;
    }

    function ensureButton() {
        if (button && button.isConnected) {
            return button;
        }

        if (button && !button.isConnected && document.body) {
            document.body.appendChild(button);
            return button;
        }

        // Never adopt a page-owned/cloned element based on an ID or data attribute.
        if (!document.body) {
            return button;
        }

        button = createButton();
        document.body.appendChild(button);
        return button;
    }

    function showButton() {
        ensureButton();
        if (button) {
            button.style.display = 'block';
        }
    }

    function hideButton() {
        if (button?.isConnected) {
            button.style.display = 'none';
        }
    }

    function rollbackSession(activeSession) {
        if (!activeSession) return;

        clearOrientationTimer();

        for (let i = activeSession.snapshots.length - 1; i >= 0; i -= 1) {
            restoreStyles(activeSession.snapshots[i]);
        }

        restoreViewportMeta(activeSession.viewportMeta);
        activeSession.active = false;
        activeSession.applied = false;
    }

    function endSession() {
        if (!session) {
            reconcileButtonVisibility();
            return;
        }

        const finished = session;
        session = null;

        rollbackSession(finished);
        reconcileButtonVisibility();
    }

    async function enterFullscreen() {
        if (session || pendingRequest || !document.documentElement?.requestFullscreen) {
            return;
        }

        const target = document.documentElement;
        const requestToken = Symbol('fullscreen-request');
        pendingRequest = {
            token: requestToken,
            target
        };

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

            if (!pendingRequest || pendingRequest.token !== requestToken) {
                // The request was cancelled or superseded.
                return;
            }

            pendingRequest = null;

            if (session !== pendingSession) {
                // A late successful request must not resurrect stale state.
                if (document.fullscreenElement === target) {
                    try {
                        await document.exitFullscreen();
                    } catch (error) {
                        console.debug('[Immersive Full Screen] Late fullscreen cleanup failed:', error);
                    }
                }
                return;
            }

            if (document.fullscreenElement !== target) {
                session = null;
                reconcileButtonVisibility();
                return;
            }

            pendingSession.active = true;
            applyImmersiveStyles(pendingSession);
            pendingSession.applied = true;
            hideButton();
        } catch (error) {
            if (pendingRequest?.token === requestToken) {
                pendingRequest = null;
            }

            if (session === pendingSession) {
                rollbackSession(pendingSession);
                session = null;
                reconcileButtonVisibility();
            }

            console.debug(
                '[Immersive Full Screen] Fullscreen request/application failed:',
                error
            );
        }
    }

    function cancelPendingRequest() {
        if (!pendingRequest) return;
        pendingRequest.cancelled = true;

        if (session && !session.active) {
            session = null;
        }
    }

    function reconcileButtonVisibility() {
        showButton();

        if (document.fullscreenElement) {
            hideButton();
        }
    }

    function handleFullscreenChange() {
        if (!session) {
            reconcileButtonVisibility();
            return;
        }

        if (document.fullscreenElement !== session.target) {
            if (!session.active) {
                cancelPendingRequest();
                reconcileButtonVisibility();
                return;
            }

            endSession();
            return;
        }

        if (!session.active) {
            session.active = true;
        }

        try {
            applyImmersiveStyles(session);
            session.applied = true;
            hideButton();
        } catch (error) {
            rollbackSession(session);
            session = null;

            console.debug(
                '[Immersive Full Screen] Fullscreen reconciliation failed:',
                error
            );

            reconcileButtonVisibility();
        }
    }

    function scheduleOrientationReconcile() {
        clearOrientationTimer();

        if (!session?.active || document.fullscreenElement !== session.target) {
            ensureButton();
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

            try {
                applyImmersiveStyles(currentSession);
            } catch (error) {
                rollbackSession(currentSession);
                session = null;

                console.debug(
                    '[Immersive Full Screen] Orientation reconciliation failed:',
                    error
                );

                reconcileButtonVisibility();
            }
        }, 300);
    }

    function reconcileButtonInBody() {
        if (!document.body) return;

        ensureButton();

        if (button && (!button.isConnected || button.parentNode !== document.body)) {
            document.body.appendChild(button);
        }

        if (session?.active && document.fullscreenElement === session.target) {
            try {
                applyImmersiveStyles(session);
            } catch (error) {
                rollbackSession(session);
                session = null;
                console.debug('[Immersive Full Screen] Body reconciliation failed:', error);
            }
        }

        reconcileButtonVisibility();
    }

    function observeBodyReplacement() {
        if (bodyObserver || !document.documentElement) return;

        bodyObserver = new MutationObserver((records) => {
            if (!document.body) return;

            const bodyChanged = records.some(record =>
                record.type === 'childList' &&
                Array.from(record.removedNodes).includes(document.body)
            );

            const buttonMoved = records.some(record =>
                record.type === 'childList' &&
                (Array.from(record.removedNodes).includes(button) ||
                 Array.from(record.addedNodes).includes(button))
            );

            if (bodyChanged || buttonMoved) {
                reconcileButtonInBody();
            }
        });

        bodyObserver.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    function initialize() {
        if (initializationDone || !document.body || !document.documentElement) {
            return;
        }

        initializationDone = true;
        ensureButton();
        observeBodyReplacement();

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
