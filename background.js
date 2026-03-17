// background.js - TrustLens Service Worker
// Scripts are injected ONLY on user action (clicking extension icon)
// This avoids triggering X.com's anti-extension detection

import { ANALYZE_ENDPOINT } from './config/api.js';

// Listen for extension icon click
chrome.action.onClicked.addListener((tab) => {
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) return;
    
    injectContentScript(tab.id);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'ANALYZE_CONTENT') {
        // In MV3, we use a robust async pattern for sendResponse
        (async () => {
            try {
                console.log('TrustLens: Starting analysis for request:', request.payload);
                const result = await handleAnalysis(request.payload);
                console.log('TrustLens: Analysis complete, sending response:', result);
                sendResponse(result);
            } catch (error) {
                console.error('TrustLens: Critical error in message listener:', error);
                sendResponse({ success: false, error: 'Internal background error: ' + error.message });
            }
        })();
        return true; // Keep the message channel open
    }
});

async function injectContentScript(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });
        // We'll also inject a "TrustLens Activated" indicator
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                if (window.__trustlensActiveNotificationShown) return;
                window.__trustlensActiveNotificationShown = true;
                const div = document.createElement('div');
                div.style.cssText = 'position:fixed;top:20px;right:20px;background:#0078d4;color:white;padding:12px 20px;border-radius:8px;z-index:999999;font-family:sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.5s;';
                div.textContent = 'TrustLens Activated: Click any "Share" button to analyze';
                document.body.appendChild(div);
                setTimeout(() => {
                    div.style.opacity = '0';
                    setTimeout(() => div.remove(), 500);
                }, 3000);
            }
        });
    } catch (error) {
        console.error('TrustLens: Injection failed', error);
    }
}

async function handleAnalysis(payload) {
    const TIMEOUT_MS = 5 * 60 * 1000; // 3 minutes — evidence pipeline can take 60-120s
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(ANALYZE_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        return { success: true, data: data };

    } catch (error) {
        clearTimeout(timeoutId);
        const isTimeout = error.name === 'AbortError';
        const message = isTimeout
            ? `Analysis timed out after ${TIMEOUT_MS / 1000}s — the server may be overloaded. Try again.`
            : error.message;
        console.error('TrustLens Error:', message);
        return { success: false, error: message };
    }
}