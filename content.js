// content.js - TrustLens Content Script
// This script is injected ONLY on user action (clicking extension icon)
// It uses a Shadow DOM to stay isolated and avoid detection by x.com

(function () {
    if (window.__trustlensInjected) {
        console.log('TrustLens: Already active in this tab.');
        return;
    }
    window.__trustlensInjected = true;

    console.log('TrustLens: Content script initialized.');

    // --- Configuration & Selectors ---
    const SHARE_SELECTORS = [
        '[aria-label*="Share"]',
        '[aria-label*="Repost"]',
        '[aria-label*="Forward"]',
        '[data-testid="share"]',
        '[data-testid="retweet"]',
        '.share-button'
    ];

    // --- Core Listener ---
    document.addEventListener('click', (event) => {
        const target = event.target;
        const shareBtn = target.closest(SHARE_SELECTORS.join(','));

        if (shareBtn) {
            console.log('TrustLens: Share action detected.');
            handleShareAction(shareBtn);
        }
    }, true); // Capture phase to ensure we see the event

    async function handleShareAction(button) {
        // Find the closest "tweet" or "post" container to extract context
        const container = button.closest('[data-testid="tweet"], article, .post, .feed-item') || document.body;
        const extracted = extractContent(container);

        if (!extracted.text && !extracted.imageUrl) {
            console.log('TrustLens: No content to analyze.');
            return;
        }

        showOverlay('Analyzing credibility...', 'neutral');

        try {
            console.log('TrustLens: Sending content for analysis...');
            const response = await chrome.runtime.sendMessage({
                type: 'ANALYZE_CONTENT',
                payload: extracted
            });

            console.log('TrustLens: Received response:', response);

            if (response && response.success) {
                showOverlay(null, null, null, response.data);
            } else {
                const errorMsg = response ? response.error : 'Unknown error';
                showOverlay('Analysis failed: ' + errorMsg, 'error');
            }
        } catch (error) {
            console.error('TrustLens Connection Error:', error);
            showOverlay('Error connecting to assistant. Please ensure the extension is reloaded and the backend is running.', 'error');
        }
    }

    function extractContent(container) {
        let text = '';
        let imageUrl = null;

        // Try to find tweet text
        const textEl = container.querySelector('[data-testid="tweetText"]') || container.querySelector('[lang]');
        if (textEl) text = textEl.innerText.trim();

        // Try to find images
        const images = container.querySelectorAll('img');
        for (const img of images) {
            if (img.src && !img.src.includes('profile_images') && !img.src.includes('emoji') && img.width > 100) {
                imageUrl = img.src;
                break;
            }
        }

        // Fallback to general text if needed
        if (!text) text = container.innerText.substring(0, 500);

        return { text: text.substring(0, 500), imageUrl };
    }

    // --- Shadow DOM Overlay ---
    let shadowRoot = null;
    let overlayElement = null;
    let detailedModal = null;

    function getPlatformName() {
        const host = window.location.hostname;
        if (host.includes('twitter.com') || host.includes('x.com')) return 'X / Twitter';
        if (host.includes('instagram.com')) return 'Instagram';
        if (host.includes('facebook.com')) return 'Facebook';
        if (host.includes('linkedin.com')) return 'LinkedIn';
        return 'Web Content';
    }

    function showOverlay(message, risk = 'neutral', score = null, data = null) {
        if (!overlayElement) {
            const host = document.createElement('div');
            host.id = 'trustlens-host';
            document.body.appendChild(host);
            shadowRoot = host.attachShadow({ mode: 'open' });

            overlayElement = document.createElement('div');
            overlayElement.id = 'trustlens-overlay';
            shadowRoot.appendChild(overlayElement);

            const style = document.createElement('style');
            style.textContent = `
                #trustlens-overlay {
                    position: fixed;
                    bottom: 24px;
                    left: 24px;
                    width: 320px;
                    background: rgba(255, 255, 255, 0.25);
                    backdrop-filter: blur(16px);
                    -webkit-backdrop-filter: blur(16px);
                    border: 1px solid rgba(255, 255, 255, 0.5);
                    border-radius: 22px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.1);
                    z-index: 2147483647;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    padding: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    transition: all 0.3s ease;
                    color: #111827;
                }
                .content-card {
                    background-color: rgba(255, 255, 255, 0.65);
                    backdrop-filter: blur(16px);
                    -webkit-backdrop-filter: blur(16px);
                    background-image: linear-gradient(180deg, rgba(50, 95, 230, 0.25) 0%, rgba(90, 145, 240, 0.1) 40%, transparent 100%);
                    background-repeat: no-repeat;
                    background-size: 100% 120px;
                    border-radius: 16px;
                    padding: 20px;
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                .header-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .app-icon {
                    width: 40px;
                    height: 40px;
                    background: #E5E7EB;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                }
                .app-info {
                    display: flex;
                    flex-direction: column;
                }
                .app-name {
                    font-weight: 700;
                    font-size: 18px;
                    color: #111827;
                }
                .app-subtitle {
                    font-size: 12px;
                    color: #6B7280;
                }
                .detected-row {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                    color: #374151;
                    margin-top: 4px;
                }
                .score-container {
                    position: relative;
                    width: 140px;
                    height: 140px;
                    margin: 0 auto;
                    border-radius: 50%;
                    background: #F3F4F6;
                    border: 4px solid #ffffff;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.08), inset 0 4px 10px rgba(0,0,0,0.1);
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    isolation: isolate;
                }
                .liquid-1, .liquid-2 {
                    position: absolute;
                    width: 300px;
                    height: 300px;
                    left: -80px;
                    border-radius: 40%;
                    animation: rotate 6s linear infinite;
                    transition: top 2s cubic-bezier(0.2, 0.8, 0.2, 1), background 1s ease;
                    z-index: 1;
                }
                .liquid-2 {
                    border-radius: 45%;
                    animation: rotate 9s linear infinite;
                    opacity: 0.5;
                    z-index: 2;
                }
                
                /* Low Risk */
                .risk-low .liquid-1 { background: linear-gradient(180deg, #10B981 0%, #059669 100%); }
                .risk-low .liquid-2 { background: linear-gradient(180deg, #34D399 0%, #10B981 100%); }
                /* Medium Risk */
                .risk-medium .liquid-1 { background: linear-gradient(180deg, #F59E0B 0%, #D97706 100%); }
                .risk-medium .liquid-2 { background: linear-gradient(180deg, #FBBF24 0%, #F59E0B 100%); }
                /* High Risk */
                .risk-high .liquid-1 { background: linear-gradient(180deg, #EF4444 0%, #DC2626 100%); }
                .risk-high .liquid-2 { background: linear-gradient(180deg, #F87171 0%, #EF4444 100%); }
                /* Neutral Risk */
                .risk-neutral .liquid-1 { background: linear-gradient(180deg, #6B7280 0%, #4B5563 100%); }
                .risk-neutral .liquid-2 { background: linear-gradient(180deg, #9CA3AF 0%, #6B7280 100%); }
                
                @keyframes rotate {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .score-text {
                    position: absolute;
                    z-index: 3;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    pointer-events: none;
                }
                .score-value {
                    font-size: 40px;
                    font-weight: 800;
                    color: #111827;
                    line-height: 1;
                    text-shadow: 0 1px 4px rgba(255,255,255,0.9);
                }
                .score-label {
                    font-size: 13px;
                    font-weight: 700;
                    color: #374151;
                    margin-top: 2px;
                    text-shadow: 0 1px 3px rgba(255,255,255,0.9);
                }
                .risk-pill {
                    align-self: center;
                    padding: 6px 16px;
                    border-radius: 20px;
                    font-size: 14px;
                    font-weight: 600;
                    backdrop-filter: blur(4px);
                    -webkit-backdrop-filter: blur(4px);
                    border: 1px solid rgba(255, 255, 255, 0.5);
                    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.03);
                }
                .risk-low { background: #D1FAE5; color: #065F46; }
                .risk-medium { background: #FEF3C7; color: #92400E; }
                .risk-high { background: #FEE2E2; color: #991B1B; }
                .risk-neutral { background: #F3F4F6; color: #374151; }
                
                .bullet-points {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                    font-size: 14px;
                    color: #4B5563;
                }
                .bullet-points li {
                    display: flex;
                    align-items: flex-start;
                    gap: 8px;
                    margin-bottom: 6px;
                }
                .bullet-points li::before {
                    content: "•";
                    color: #111827;
                    font-weight: bold;
                }
                .button-row {
                    display: flex;
                    gap: 12px;
                    margin-top: 4px;
                    padding: 0 8px;
                }
                .btn {
                    flex: 1;
                    padding: 10px;
                    border-radius: 999px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    border: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    transition:
                        background-color 220ms ease-in-out,
                        color 220ms ease-in-out,
                        box-shadow 220ms ease-in-out,
                        transform 220ms ease-in-out;
                }
                .btn:active {
                    transform: translateY(0.5px);
                }
                .btn-learn {
                    background: linear-gradient(135deg, #4f7cff, #6fa8ff);
                    color: #ffffff;
                    box-shadow: 0 4px 15px rgba(79, 124, 255, 0.3);
                }
                .btn-learn:hover { 
                    background: linear-gradient(135deg, #3d68e6, #5a94f0);
                    box-shadow: 0 6px 20px rgba(79, 124, 255, 0.4);
                    transform: translateY(-2px);
                }
                .btn-dismiss {
                    background: rgba(255, 255, 255, 0.4);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    color: #1e3a8a;
                    border: 1px solid rgba(255, 255, 255, 0.6);
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.03);
                }
                .btn-dismiss:hover { 
                    background: rgba(255, 255, 255, 0.6);
                    transform: translateY(-2px);
                    box-shadow: 0 6px 15px rgba(0, 0, 0, 0.05);
                }

                /* Detailed Modal */
                #trustlens-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    background: rgba(0,0,0,0.5);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 2147483647;
                }
                .modal-content {
                    background: rgba(255, 255, 255, 0.25);
                    backdrop-filter: blur(24px);
                    -webkit-backdrop-filter: blur(24px);
                    border: 1px solid rgba(255, 255, 255, 0.4);
                    width: 90%;
                    max-width: 800px;
                    height: 85vh;
                    max-height: 90vh;
                    border-radius: 24px;
                    overflow: hidden;
                    box-shadow: 0 15px 40px rgba(0, 0, 0, 0.1), inset 0 2px 20px rgba(255, 255, 255, 0.8), 0 0 60px rgba(255, 255, 255, 0.2);
                    display: flex;
                    flex-direction: column;
                }
                .modal-body {
                    padding: 32px;
                    overflow-y: auto;
                    overflow-x: hidden;
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                }
                .modal-footer {
                    padding: 20px 32px;
                    background: rgba(255, 255, 255, 0.4);
                    border-top: 1px solid rgba(255, 255, 255, 0.5);
                    display: flex;
                    justify-content: center;
                }
                .chat-section {
                    margin-top: 10px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                .chat-container {
                    display: flex;
                    width: 100%;
                    background: rgba(255, 255, 255, 0.65);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.6);
                    border-radius: 24px;
                    padding: 4px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.04);
                    align-items: center;
                    transition: all 0.3s ease;
                    min-height: 48px;
                    position: relative;
                }
                .chat-container:focus-within {
                    box-shadow: 0 6px 20px rgba(79, 124, 255, 0.15);
                    border-color: #4f7cff;
                }
                .chat-input {
                    flex: 1;
                    border: none;
                    outline: none;
                    background: transparent;
                    padding: 8px 16px;
                    font-size: 15px;
                    color: #111827;
                    resize: vertical;
                    min-height: 40px;
                    max-height: 150px;
                    line-height: 1.5;
                    font-family: inherit;
                }
                .chat-answer-container {
                    background: rgba(243, 244, 246, 0.8);
                    border-radius: 16px;
                    padding: 16px 20px;
                    font-size: 15px;
                    line-height: 1.6;
                    color: #374151;
                    display: none;
                    border-left: 4px solid #4f7cff;
                }
                .chat-input::placeholder {
                    color: #9CA3AF;
                }
                .chat-send-btn {
                    background: linear-gradient(135deg, #4f7cff, #6fa8ff);
                    color: white;
                    border: none;
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                    flex-shrink: 0;
                    margin-right: 4px;
                    box-shadow: 0 4px 10px rgba(79, 124, 255, 0.3);
                }
                .chat-send-btn:hover {
                    transform: scale(1.05);
                    box-shadow: 0 6px 14px rgba(79, 124, 255, 0.4);
                }
                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                }
                .modal-title {
                    font-size: 24px;
                    font-weight: 800;
                    color: #111827;
                    text-align: center;
                    margin-bottom: 12px;
                    width: 100%;
                }
                .modal-close {
                    cursor: pointer;
                    font-size: 20px;
                    color: #EF4444;
                    background: #FEE2E2;
                    width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    transition: all 0.2s ease;
                    font-weight: bold;
                    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.2);
                }
                .modal-close:hover {
                    background: #FECACA;
                    color: #DC2626;
                    transform: scale(1.05);
                }
                .analysis-slider {
                    position: relative;
                    height: 360px;
                    min-height: 360px;
                    flex-shrink: 0;
                    margin-top: 16px;
                    width: 100%;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    perspective: 1000px;
                }
                .slider-card {
                    position: absolute;
                    width: 440px;
                    height: 320px;
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(24px) saturate(120%);
                    -webkit-backdrop-filter: blur(24px);
                    border: 1px solid rgba(79, 124, 255, 0.4);
                    box-shadow: none;
                    border-radius: 20px;
                    padding: 24px 16px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    gap: 12px;
                    transition: all 0.5s cubic-bezier(0.25, 0.8, 0.25, 1);
                    cursor: pointer;
                    overflow: hidden; /* To contain pseudo-elements */
                }
                
                /* Gradient Glow Layer */
                .slider-card::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    z-index: 0;
                    pointer-events: none;
                    background: radial-gradient(circle at top left, rgba(79, 124, 255, 0.25) 0%, transparent 60%);
                }
                


                /* Ensure content stays above pseudo-elements */
                .slider-card > * {
                    position: relative;
                    z-index: 1;
                }
                .slider-card.pos-left {
                    transform: translateX(-280px) scale(0.75);
                    opacity: 0.6;
                    z-index: 1;
                }
                .slider-card.pos-center {
                    transform: translateX(0) scale(1.05);
                    opacity: 1;
                    z-index: 3;
                    box-shadow: none;
                }
                .slider-card.pos-right {
                    transform: translateX(280px) scale(0.75);
                    opacity: 0.6;
                    z-index: 1;
                }
                .slider-card-title {
                    font-size: 16px;
                    font-weight: 700;
                    color: #374151;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .slider-content {
                    font-size: 13px;
                    color: #4B5563;
                    line-height: 1.5;
                    padding: 4px 12px;
                    width: 100%;
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                }
                
                /* Small Circular Progress for Cards */
                @keyframes floatScore {
                    0% { transform: translateY(0px) scale(1); filter: drop-shadow(0 4px 10px rgba(0,0,0,0.05)); }
                    100% { transform: translateY(-5px) scale(1.05); filter: drop-shadow(0 10px 20px rgba(0,0,0,0.15)); }
                }
                .small-score-container {
                    position: relative;
                    width: 100px;
                    height: 100px;
                    margin: 0 auto;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: floatScore 3s ease-in-out infinite alternate;
                    background: radial-gradient(circle, rgba(255,255,255,1) 30%, rgba(255,255,255,0) 70%);
                    border-radius: 50%;
                }
                .small-circular-progress {
                    transform: rotate(-90deg);
                    width: 100%;
                    height: 100%;
                    position: relative;
                    z-index: 2;
                }
                .small-circle-bg {
                    fill: none;
                    stroke: rgba(229, 231, 235, 0.6);
                    stroke-width: 10;
                }
                @keyframes strokePulse {
                    0% { stroke-width: 10; opacity: 0.9; }
                    50% { stroke-width: 12; opacity: 1; filter: drop-shadow(0 0 6px currentColor); }
                    100% { stroke-width: 10; opacity: 0.9; }
                }
                .small-circle-progress {
                    fill: none;
                    stroke-width: 10;
                    stroke-linecap: round;
                    stroke-dasharray: 283; /* 2 * PI * r (r=45) */
                    stroke-dashoffset: 283;
                    transition: stroke-dashoffset 1.5s cubic-bezier(0.25, 0.8, 0.25, 1);
                    animation: strokePulse 2.5s infinite ease-in-out;
                }
                .small-score-text {
                    position: absolute;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    z-index: 3;
                    text-shadow: 0 2px 4px rgba(255,255,255,0.8);
                }
                .small-score-value {
                    font-size: 24px;
                    font-weight: 800;
                    color: #111827;
                    line-height: 1;
                }
                .small-score-label {
                    font-size: 10px;
                    font-weight: 600;
                    color: #6B7280;
                    margin-top: 2px;
                }
                
                /* Keep section card for verdict */
                .section-card {
                    background-color: rgba(255, 255, 255, 0.65);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border-radius: 16px;
                    padding: 20px;
                    border: 1px solid rgba(255, 255, 255, 0.6);
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.04);
                }
                .section-title {
                    font-size: 15px;
                    font-weight: 800;
                    color: #1f2937;
                    text-transform: uppercase;
                    margin-bottom: 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .section-text {
                    font-size: 15px;
                    line-height: 1.6;
                    color: #374151;
                }
                .preview-img {
                    width: 100%;
                    border-radius: 12px;
                    margin-bottom: 12px;
                    object-fit: cover;
                    max-height: 300px;
                    border: 1px solid #E5E7EB;
                }
                .red-flag-item {
                    color: #991B1B;
                    background: #FEE2E2;
                    padding: 4px 10px;
                    border-radius: 6px;
                    font-size: 13px;
                    display: inline-block;
                    margin: 2px;
                }
            `;
            shadowRoot.appendChild(style);
        }

        let finalScore = score;
        let finalRisk = risk;
        let points = [];

        if (data) {
            // Backend returns snake_case: credibility_score, risk_level, verdict
            // Older shape may use camelCase: finalScore, riskLevel, finalVerdict
            // Support both so the popup never shows "undefined"
            finalScore = data.finalResult.finalScore
                      ?? data.finalResult.credibility_score
                      ?? data.finalResult.overallScore
                      ?? data.finalResult.score
                      ?? '—';
            finalRisk  = data.finalResult.riskLevel
                      ?? data.finalResult.risk_level
                      ?? 'medium';

            // Collect bullet points
            if (data.textAnalysis && data.textAnalysis.riskKeywordsFound) {
                points = [...points, ...data.textAnalysis.riskKeywordsFound];
            }
            if (data.imageAnalysis && data.imageAnalysis.llmAnalysis && data.imageAnalysis.llmAnalysis.visualRedFlags) {
                points = [...points, ...data.imageAnalysis.llmAnalysis.visualRedFlags];
            }

            // If no points but high risk, use common patterns
            if (points.length === 0 && finalRisk !== 'low') {
                if (data.finalResult.explanation) {
                    points = data.finalResult.explanation.split('.').filter(s => s.trim().length > 10).slice(0, 2);
                }
            }
            // Fallback to scoreReasoning or riskFactors
            if (points.length === 0) {
                const sr = data.textAnalysis?.scoreReasoning;
                if (sr) points = [sr.substring(0, 120)];
            }
            if (points.length === 0) points = ["Analyzing source credibility", "Verification in progress"];
        }

        const safeRisk = (finalRisk || 'neutral').toLowerCase();
        const riskMap = { minimal: 'low', low: 'low', 'low-medium': 'low', medium: 'medium', high: 'high' };
        const scoreClass = riskMap[safeRisk] || (data ? 'medium' : 'neutral');
        const colorMap = { low: '#059669', medium: '#F59E0B', high: '#DC2626', neutral: '#6B7280' };

        // Liquid offset calculate
        const finalScoreNum = parseInt(finalScore) || 0;
        const topOffset = data ? Math.max(-20, 140 - (finalScoreNum * 1.6)) : 140;

        overlayElement.innerHTML = `
            <div class="content-card">
                <div class="header-row">
                    <div class="app-icon">🛡️</div>
                    <div class="app-info">
                        <span class="app-name">TrustLens</span>
                        <span class="app-subtitle">AI-powered credibility assistant</span>
                    </div>
                </div>

                <div class="detected-row">
                    <span>📷 Detected: <strong>${getPlatformName()}</strong></span>
                </div>

                <div class="score-container risk-${scoreClass}">
                    <div class="liquid-1" style="top: ${topOffset}px;"></div>
                    <div class="liquid-2" style="top: ${topOffset + 4}px;"></div>
                    <div class="score-text">
                        <span class="score-value">${data ? finalScore : '...'}</span>
                        <span class="score-label">out of 100</span>
                    </div>
                </div>

                <div class="risk-pill risk-${scoreClass}">
                    ${safeRisk.toUpperCase()} RISK
                </div>

                <ul class="bullet-points">
                    ${points.slice(0, 2).map(p => `<li>${p}</li>`).join('')}
                </ul>
            </div>

            <div class="button-row">
                <button class="btn btn-learn" id="tl-learn">ℹ️ Learn Why</button>
                <button class="btn btn-dismiss" id="tl-dismiss">✕ Dismiss</button>
            </div>
        `;

        if (message && !data) {
            overlayElement.querySelector('.bullet-points').innerHTML = `<li>${message}</li>`;
        }

        shadowRoot.getElementById('tl-dismiss').onclick = closeOverlay;

        if (data) {
            shadowRoot.getElementById('tl-learn').onclick = () => showDetailedPopup(data);
        } else {
            // TEMPORARY: Allow "Learn Why" to directly open a mock detailed overlay without waiting for backend
            shadowRoot.getElementById('tl-learn').onclick = () => showDetailedPopup({
                finalResult: {
                    overallScore: 55,
                    riskLevel: 'medium',
                    verdict: 'Mock Verification',
                    explanation: 'This is a temporary mock analysis since the backend is currently unavailable.'
                },
                textAnalysis: {
                    extractedText: 'Sample extracted text (Backend not connected)',
                    explanation: 'Mock detailed text analysis.'
                }
            });
        }

        overlayElement.style.opacity = '1';
        overlayElement.style.transform = 'translateY(0)';
    }

    function showDetailedPopup(data) {
        if (detailedModal) detailedModal.remove();

        detailedModal = document.createElement('div');
        detailedModal.id = 'trustlens-modal-overlay';

        const finalResult = data.finalResult;
        const imgAnalysis = data.imageAnalysis && data.imageAnalysis.llmAnalysis ? data.imageAnalysis.llmAnalysis : null;
        const textAnalysis = data.textAnalysis ? data.textAnalysis : null;

        detailedModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-body">
                    <div class="modal-header">
                        <div style="flex: 1;"></div>
                        <div class="modal-close" id="modal-close">✕</div>
                    </div>

                    <div class="section-card" style="border-left: 6px solid ${(() => { const rl = (finalResult.riskLevel || finalResult.risk_level || '').toLowerCase(); return rl === 'high' || rl === 'critical' ? '#DC2626' : rl === 'medium' ? '#F59E0B' : '#059669'; })()}">
                        <div class="modal-title">TrustLens Deep Analysis</div>
                        <div class="section-title">⚖️ Verdict: ${finalResult.finalVerdict || finalResult.verdict || 'N/A'} (${finalResult.finalScore ?? finalResult.credibility_score ?? finalResult.score ?? '—'}/100)</div>
                        <div class="section-text">${finalResult.verificationBreakdown?.length ? finalResult.verificationBreakdown.slice(0,1).map(b => b.reasoning || '').join('') || finalResult.verifiedClaims?.[0]?.verdict || '' : (finalResult.explanation || '')}</div>
                    </div>

                    <div class="analysis-slider">
                        <!-- Card 1: Text Analysis -->
                        <div class="slider-card">
                            <div class="slider-card-title">📝 Text Analysis</div>
                            <div class="small-score-container">
                                <svg class="small-circular-progress" viewBox="0 0 100 100">
                                    <circle class="small-circle-bg" cx="50" cy="50" r="45"></circle>
                                    <circle class="small-circle-progress" cx="50" cy="50" r="45" 
                                        style="stroke-dashoffset: 283; stroke: #9CA3AF; transition: stroke 1s ease 0.5s;"></circle>
                                </svg>
                                <div class="small-score-text">
                                    <span class="small-score-value">0</span>
                                    <span class="small-score-label">Score</span>
                                </div>
                            </div>
                            <div class="slider-content">
                                ${(() => {
                                    const sr = textAnalysis?.scoreReasoning || textAnalysis?.explanation || 'Text analysis not available.';
                                    const breakdown = data?.finalResult?.verificationBreakdown;
                                    let evHtml = '';
                                    if (breakdown && breakdown.length) {
                                        evHtml = '<br><br>' + breakdown.slice(0, 2).map(b => {
                                            const icon = b.verdict === 'SUPPORTED' ? '✅' : b.verdict === 'CONTRADICTED' ? '❌' : '⚪';
                                            const txt = (b.reasoning || b.claim || '').substring(0, 110);
                                            return `<span style="font-size:12px;color:#6B7280">${icon} ${txt}</span>`;
                                        }).join('<br>');
                                    }
                                    return sr + evHtml;
                                })()}
                            </div>
                        </div>

                        <!-- Card 2: Image/Video Analysis -->
                        <div class="slider-card">
                            <div class="slider-card-title">🖼️ Media Analysis</div>
                            <div class="small-score-container">
                                <svg class="small-circular-progress" viewBox="0 0 100 100">
                                    <circle class="small-circle-bg" cx="50" cy="50" r="45"></circle>
                                    <circle class="small-circle-progress" cx="50" cy="50" r="45" 
                                        style="stroke-dashoffset: 283; stroke: #9CA3AF; transition: stroke 1s ease 0.5s;"></circle>
                                </svg>
                                <div class="small-score-text">
                                    <span class="small-score-value">0</span>
                                    <span class="small-score-label">Authentic</span>
                                </div>
                            </div>
                            <div class="slider-content">
                                ${imgAnalysis
                                    ? (imgAnalysis.mediaExplanation || imgAnalysis.explanation || 'Media analysed successfully.')
                                    : (data?.videoAnalysis?.status === 'processed'
                                        ? (data.videoAnalysis.explanation || 'Video content analysed.')
                                        : 'No visual media found in this post.')}
                            </div>
                        </div>

                        <!-- Card 3: AI Probability -->
                        <div class="slider-card">
                            <div class="slider-card-title">🤖 AI Probability</div>
                            <div class="small-score-container">
                                <svg class="small-circular-progress" viewBox="0 0 100 100">
                                    <circle class="small-circle-bg" cx="50" cy="50" r="45"></circle>
                                    <circle class="small-circle-progress" cx="50" cy="50" r="45" 
                                        style="stroke-dashoffset: 283; stroke: #9CA3AF; transition: stroke 1s ease 0.5s;"></circle>
                                </svg>
                                <div class="small-score-text">
                                    <span class="small-score-value">0%</span>
                                    <span class="small-score-label">AI Gen</span>
                                </div>
                            </div>
                            <div class="slider-content">
                                ${imgAnalysis
                                    ? (imgAnalysis.aiReasoning || (imgAnalysis.manipulation_analysis?.ai_artifacts_detected
                                        ? 'AI-generation artifacts were detected in this image.'
                                        : 'No AI-generation artifacts detected. The image exhibits organic photographic properties.'))
                                    : 'No image or video available for AI generation analysis.'}
                            </div>
                        </div>
                        </div>

                        <!-- ═══════════════════════════════════════════════════════════
                             NEW SECTIONS — surfaces previously-unused backend fields
                        ═══════════════════════════════════════════════════════════ -->

                        ${(() => {
                            const narrative = data.narrativeAnalysis;
                            if (!narrative) return '';
                            const campaignBanner = narrative.campaign_detected
                                ? `<div style="background:#FEE2E2;border:1px solid #FECACA;border-radius:10px;padding:10px 14px;font-size:13px;color:#991B1B;font-weight:600;margin-bottom:8px;">
                                    ⚠️ Coordinated narrative campaign detected across ${narrative.clusters_detected || 'multiple'} claim clusters.
                                   </div>` : '';
                            const summary = narrative.summary;
                            const summaryText = summary && (summary.narrative_label || summary.summary)
                                ? `<div style="font-size:13px;color:#374151;line-height:1.5;">${summary.narrative_label ? '<strong>' + summary.narrative_label + '</strong> — ' : ''}${summary.summary || ''}</div>`
                                : '';
                            if (!campaignBanner && !summaryText) return '';
                            return `<div class="section-card" style="margin-top:0;">
                                <div class="section-title">🕸️ Narrative Intelligence</div>
                                ${campaignBanner}${summaryText}
                                <div style="font-size:12px;color:#9CA3AF;margin-top:6px;">${narrative.clusters_detected || 0} cluster(s) detected</div>
                            </div>`;
                        })()}

                        ${(() => {
                            const claims = data.claimsVerified;
                            if (!claims || !claims.length) return '';
                            const rows = claims.slice(0, 5).map(c => {
                                const icon = c.verdict === 'SUPPORTED' ? '✅' : c.verdict === 'CONTRADICTED' ? '❌' : '⚪';
                                const srcBadge = c.source ? `<span style="font-size:10px;background:#E5E7EB;border-radius:4px;padding:1px 5px;color:#6B7280;">${c.source}</span>` : '';
                                return `<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.05);">
                                    <span style="font-size:16px;flex-shrink:0">${icon}</span>
                                    <div style="flex:1;font-size:13px;color:#374151;line-height:1.4;">${(c.claim || '').substring(0, 120)} ${srcBadge}</div>
                                </div>`;
                            }).join('');
                            return `<div class="section-card" style="margin-top:0;">
                                <div class="section-title">🔍 Claims Verified (${claims.length})</div>
                                ${rows}
                                ${claims.length > 5 ? `<div style="font-size:12px;color:#9CA3AF;margin-top:6px;">+${claims.length - 5} more claims verified</div>` : ''}
                            </div>`;
                        })()}

                        ${(() => {
                            const sa = data.sourceAnalysis;
                            if (!sa) return '';
                            const total = (sa.tier1_sources || 0) + (sa.tier2_sources || 0) + (sa.low_trust_sources || 0);
                            if (total === 0) return '';
                            const agreeColor = sa.agreement_score >= 0.7 ? '#059669' : sa.agreement_score >= 0.4 ? '#F59E0B' : '#DC2626';
                            return `<div class="section-card" style="margin-top:0;">
                                <div class="section-title">📰 Source Breakdown</div>
                                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px;">
                                    <div style="text-align:center;background:#D1FAE5;border-radius:8px;padding:8px;">
                                        <div style="font-size:20px;font-weight:800;color:#065F46;">${sa.tier1_sources || 0}</div>
                                        <div style="font-size:11px;color:#6B7280;">Tier-1 trusted</div>
                                    </div>
                                    <div style="text-align:center;background:#FEF3C7;border-radius:8px;padding:8px;">
                                        <div style="font-size:20px;font-weight:800;color:#92400E;">${sa.tier2_sources || 0}</div>
                                        <div style="font-size:11px;color:#6B7280;">Tier-2</div>
                                    </div>
                                    <div style="text-align:center;background:#FEE2E2;border-radius:8px;padding:8px;">
                                        <div style="font-size:20px;font-weight:800;color:#991B1B;">${sa.low_trust_sources || 0}</div>
                                        <div style="font-size:11px;color:#6B7280;">Low trust</div>
                                    </div>
                                </div>
                                <div style="font-size:13px;color:#374151;">Source agreement: <strong style="color:${agreeColor}">${Math.round((sa.agreement_score || 0) * 100)}%</strong></div>
                            </div>`;
                        })()}

                        ${(() => {
                            const ta = data.temporalAnalysis;
                            if (!ta || (!ta.freshness_label && !ta.temporal_risk && !ta.summary && !ta.explanation)) return '';
                            const freshnessColor = ta.freshness_label === 'FRESH' ? '#059669' : ta.freshness_label === 'STALE' ? '#DC2626' : '#F59E0B';
                            return `<div class="section-card" style="margin-top:0;">
                                <div class="section-title">⏱️ Temporal Analysis</div>
                                ${ta.freshness_label ? `<div style="display:inline-block;background:${freshnessColor}22;color:${freshnessColor};font-weight:700;font-size:12px;padding:3px 10px;border-radius:20px;margin-bottom:8px;">${ta.freshness_label}</div>` : ''}
                                <div style="font-size:13px;color:#374151;line-height:1.5;">${ta.summary || ta.explanation || (ta.temporal_risk ? 'Temporal risk: ' + ta.temporal_risk : '')}</div>
                            </div>`;
                        })()}

                        ${(() => {
                            const keyClaims = textAnalysis?.keyClaims || textAnalysis?.validatedClaims || textAnalysis?.semantic?.keyClaims;
                            if (!keyClaims || !keyClaims.length) return '';
                            const primaryClaim = textAnalysis?.semantic?.primaryClaim;
                            const items = keyClaims.slice(0, 4).map(c =>
                                `<div style="font-size:13px;color:#374151;padding:5px 0;border-bottom:1px solid rgba(0,0,0,0.05);">💬 ${String(c).substring(0, 130)}</div>`
                            ).join('');
                            return `<div class="section-card" style="margin-top:0;">
                                <div class="section-title">💡 Key Claims Extracted</div>
                                ${primaryClaim ? `<div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:8px;">Primary: ${primaryClaim}</div>` : ''}
                                ${items}
                            </div>`;
                        })()}

                        <!-- Chat widget -->
                        <div class="chat-section">
                            <div class="chat-container">
                                <textarea placeholder="Ask a question about this analysis..." class="chat-input" id="tl-chat-input" rows="1"></textarea>
                                <button class="chat-send-btn" id="tl-chat-send" title="Send question">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <line x1="22" y1="2" x2="11" y2="13"></line>
                                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                                    </svg>
                                </button>
                            </div>
                            <div class="chat-answer-container" id="tl-chat-answer"></div>
                        </div>

                    </div>
                </div>
            </div>
        `;

        shadowRoot.appendChild(detailedModal);

        // --- Animate Score Rings ---
        const animateScores = () => {
            const animateRing = (selector, targetScore, targetColorHex) => {
                const ring = detailedModal.querySelector(selector + ' .small-circle-progress');
                const textEl = detailedModal.querySelector(selector + ' .small-score-value');
                if (!ring || !textEl || isNaN(targetScore)) return;

                let duration = 1500;
                let startTime = null;
                const isAi = selector.includes('nth-child(3)');

                const step = (timestamp) => {
                    if (!startTime) startTime = timestamp;
                    let progress = Math.min((timestamp - startTime) / duration, 1);
                    let easeProgress = 1 - Math.pow(1 - progress, 4);
                    let currentVal = Math.floor(easeProgress * targetScore);
                    textEl.textContent = isAi ? currentVal + '%' : currentVal;
                    ring.style.strokeDashoffset = 283 - (283 * currentVal) / 100;
                    if (progress < 1) {
                        requestAnimationFrame(step);
                    } else {
                        textEl.textContent = isAi ? targetScore + '%' : targetScore;
                        ring.style.strokeDashoffset = 283 - (283 * targetScore) / 100;
                    }
                };
                requestAnimationFrame(step);
                ring.style.stroke = targetColorHex;
            };

            setTimeout(() => {
                const textScore = data.textAnalysis?.credibilityScore ?? 50;
                const mediaScore = data.imageAnalysis?.credibilityScore ?? (data.videoAnalysis?.credibilityScore ?? 50);
                const aiPct = Math.round((data.imageAnalysis?.llmAnalysis?.aiGeneratedProbability ?? 0) * 100);
                animateRing('.slider-card:nth-child(1)', textScore, '#4f7cff');
                animateRing('.slider-card:nth-child(2)', mediaScore, '#10B981');
                animateRing('.slider-card:nth-child(3)', aiPct, '#DC2626');
            }, 100);
        };

        animateScores();

        const closeBtn = () => {
            detailedModal.remove();
            detailedModal = null;
        };

        const cards = detailedModal.querySelectorAll('.slider-card');
        let activeIndex = 1;

        const updateCards = () => {
            cards.forEach((c, i) => {
                c.className = 'slider-card';
                if (i === activeIndex) c.classList.add('pos-center');
                else if (i === (activeIndex + 2) % 3) c.classList.add('pos-left');
                else c.classList.add('pos-right');
            });
        };

        updateCards();

        cards.forEach((card, idx) => {
            card.addEventListener('click', () => {
                activeIndex = idx;
                updateCards();
            });
        });

        shadowRoot.getElementById('modal-close').onclick = closeBtn;

        const chatSendBtn = shadowRoot.getElementById('tl-chat-send');
        const chatInput = shadowRoot.getElementById('tl-chat-input');

        if (chatSendBtn && chatInput) {
            chatSendBtn.onclick = () => {
                if (chatInput.value.trim()) {
                    const question = chatInput.value.trim();
                    console.log('Sending chat question:', question);

                    const answerContainer = shadowRoot.getElementById('tl-chat-answer');
                    if (answerContainer) {
                        answerContainer.style.display = 'block';
                        answerContainer.innerHTML = `<span style="font-weight:700; color:#4f7cff;">TrustLens AI:</span> Generating response for: "<i>${question}</i>"...<br><br>Based on the analysis, this content appears to follow standard patterns. The image shows no distinct signs of deepfake artifacts, though you should always verify the source.`;
                    }

                    chatInput.value = '';
                }
            };
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    chatSendBtn.click();
                }
            });
        }

        detailedModal.onclick = (e) => {
            if (e.target === detailedModal) closeBtn();
        };
    }

    function closeOverlay() {
        if (!overlayElement) return;
        overlayElement.style.opacity = '0';
        overlayElement.style.transform = 'translateY(20px)';
        setTimeout(() => {
            const host = document.getElementById('trustlens-host');
            if (host) host.remove();
            overlayElement = null;
        }, 300);
    }

})();