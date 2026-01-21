/**
 * Popup Script
 * 
 * Responsibilities:
 * - Display detected tokens with partial masking
 * - Allow user to select and copy a specific token
 * - Provide access to settings
 * - Allow manual data clearing
 */

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const tokenListEl = document.getElementById('tokenList');
const statusTextEl = document.getElementById('statusText');
const tokenCountEl = document.getElementById('tokenCount');
const settingsBtn = document.getElementById('settingsBtn');
const scanBtn = document.getElementById('scanBtn');
const clearBtn = document.getElementById('clearBtn');

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Mask a token for display, showing only first and last few characters
 * @param {string} token - Full token value
 * @returns {string} - Masked token
 */
function maskToken(token) {
    if (!token || token.length < 12) {
        return '••••••••••••';
    }

    const visibleStart = 4;
    const visibleEnd = 4;
    const masked = '•'.repeat(Math.min(20, token.length - visibleStart - visibleEnd));

    return token.slice(0, visibleStart) + masked + token.slice(-visibleEnd);
}

/**
 * Truncate URL for display
 * @param {string} url - Full URL
 * @param {number} maxLength - Maximum characters
 * @returns {string} - Truncated URL
 */
function truncateUrl(url, maxLength = 40) {
    if (url.length <= maxLength) return url;
    return url.slice(0, maxLength - 3) + '...';
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        console.error('Failed to copy:', error);
        return false;
    }
}

/**
 * Show temporary feedback message
 * @param {HTMLElement} element - Element to show feedback on
 * @param {string} message - Feedback message
 */
function showFeedback(element, message) {
    const originalText = element.textContent;
    element.textContent = message;
    element.classList.add('feedback');

    setTimeout(() => {
        element.textContent = originalText;
        element.classList.remove('feedback');
    }, 1500);
}

// ============================================================================
// TOKEN RENDERING
// ============================================================================

/**
 * Render the list of detected tokens
 * @param {Array} tokens - Array of token objects
 * @param {number} maxTokens - Maximum tokens allowed
 */
function renderTokens(tokens, maxTokens) {
    tokenListEl.innerHTML = '';

    // Update token count display
    tokenCountEl.textContent = `${tokens.length} / ${maxTokens} tokens`;

    if (tokens.length === 0) {
        tokenListEl.innerHTML = `
      <div class="empty-state">
        <p>No tokens detected yet.</p>
        <p class="hint">Make API calls on the active tab to detect tokens.</p>
      </div>
    `;
        return;
    }

    // Create token cards
    tokens.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'token-card';
        card.dataset.index = index;

        card.innerHTML = `
      <div class="token-url" title="${item.url}">
        📡 ${truncateUrl(item.url)}
      </div>
      <div class="token-value">
        <code>${maskToken(item.token)}</code>
      </div>
      <button class="copy-btn" data-token="${encodeURIComponent(item.token)}">
        📋 Copy Token
      </button>
    `;

        tokenListEl.appendChild(card);
    });

    // Add copy event listeners
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const token = decodeURIComponent(btn.dataset.token);
            const success = await copyToClipboard(token);

            if (success) {
                showFeedback(btn, '✅ Copied!');
            } else {
                showFeedback(btn, '❌ Failed');
            }
        });
    });
}

// ============================================================================
// DATA LOADING
// ============================================================================

/**
 * Load and display current tokens
 */
async function loadTokens() {
    try {
        // Get current settings for maxTokens
        const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
        const maxTokens = settingsResponse.settings?.maxTokens || 5;

        // Get current tokens
        const response = await chrome.runtime.sendMessage({ type: 'GET_TOKENS' });
        const tokens = response.tokens || [];

        renderTokens(tokens, maxTokens);

        // Update status based on token source
        const source = settingsResponse.settings?.tokenSource || 'headers';
        updateStatusText(source);
    } catch (error) {
        console.error('Error loading tokens:', error);
        tokenListEl.innerHTML = `
      <div class="empty-state error">
        <p>Error loading tokens.</p>
        <p class="hint">Please try again.</p>
      </div>
    `;
    }
}

/**
 * Update status text based on current source
 */
function updateStatusText(source) {
    const sourceText = {
        headers: 'Monitoring API request headers...',
        storage: 'Click Scan to check browser storage...',
        cookies: 'Click Scan to check cookies...'
    };

    statusTextEl.textContent = sourceText[source] || 'Monitoring active tab...';
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

// Settings button - open settings page
settingsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'settings.html' });
});

// Scan button - trigger manual scan for storage/cookies
scanBtn.addEventListener('click', async () => {
    scanBtn.disabled = true;
    scanBtn.textContent = '⏳ Scanning...';

    try {
        const response = await chrome.runtime.sendMessage({ type: 'SCAN_STORAGE' });
        const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
        const maxTokens = settingsResponse.settings?.maxTokens || 5;

        renderTokens(response.tokens || [], maxTokens);
    } catch (error) {
        console.error('Scan error:', error);
    }

    scanBtn.disabled = false;
    scanBtn.textContent = '🔍 Scan';
});

// Clear button - clear all data
clearBtn.addEventListener('click', () => {
    showConfirmModal();
});

// Listen for token updates from background
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TOKENS_UPDATED') {
        loadTokens();
    }
});

// ============================================================================
// CUSTOM MODAL
// ============================================================================

const confirmModal = document.getElementById('confirmModal');
const modalCancel = document.getElementById('modalCancel');
const modalConfirm = document.getElementById('modalConfirm');

/**
 * Show the custom confirmation modal
 */
function showConfirmModal() {
    confirmModal.classList.remove('hidden');
}

/**
 * Hide the custom confirmation modal
 */
function hideConfirmModal() {
    confirmModal.classList.add('hidden');
}

// Cancel button - close modal
modalCancel.addEventListener('click', () => {
    hideConfirmModal();
});

// Confirm button - clear data and close modal
modalConfirm.addEventListener('click', async () => {
    try {
        await chrome.runtime.sendMessage({ type: 'CLEAR_DATA' });
        const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
        const maxTokens = settingsResponse.settings?.maxTokens || 5;

        renderTokens([], maxTokens);
        showFeedback(clearBtn, '✅ Cleared!');
    } catch (error) {
        console.error('Clear error:', error);
    }
    hideConfirmModal();
});

// Close modal when clicking outside
confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
        hideConfirmModal();
    }
});

// ============================================================================
// INITIALIZATION
// ============================================================================

// Load tokens when popup opens
document.addEventListener('DOMContentLoaded', loadTokens);
