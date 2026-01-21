/**
 * Settings Script
 * 
 * Responsibilities:
 * - Load and display current settings
 * - Handle settings form submission
 * - Validate user inputs (especially max tokens 1-5)
 * - Provide manual data clearing
 */

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const settingsForm = document.getElementById('settingsForm');
const customHeaderGroup = document.getElementById('customHeaderGroup');
const customHeaderInput = document.getElementById('customHeaderName');
const maxTokensSlider = document.getElementById('maxTokens');
const maxTokensValue = document.getElementById('maxTokensValue');
const autoCleanupCheckbox = document.getElementById('autoCleanup');
const clearNowBtn = document.getElementById('clearNowBtn');
const saveStatus = document.getElementById('saveStatus');

// ============================================================================
// SETTINGS LOADING
// ============================================================================

/**
 * Load current settings and populate form
 */
async function loadSettings() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
        const settings = response.settings;

        if (settings) {
            // Token type
            const tokenTypeRadio = document.querySelector(
                `input[name="tokenType"][value="${settings.tokenType}"]`
            );
            if (tokenTypeRadio) {
                tokenTypeRadio.checked = true;
            }

            // Custom header name
            if (settings.customHeaderName) {
                customHeaderInput.value = settings.customHeaderName;
            }

            // Show/hide custom header input
            toggleCustomHeader(settings.tokenType === 'custom');

            // Token source
            const tokenSourceRadio = document.querySelector(
                `input[name="tokenSource"][value="${settings.tokenSource}"]`
            );
            if (tokenSourceRadio) {
                tokenSourceRadio.checked = true;
            }

            // Max tokens (enforce 1-5 range)
            const maxTokens = Math.min(5, Math.max(1, settings.maxTokens || 5));
            maxTokensSlider.value = maxTokens;
            maxTokensValue.textContent = maxTokens;

            // Auto cleanup
            autoCleanupCheckbox.checked = settings.autoCleanup !== false;
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        showSaveStatus('Error loading settings', 'error');
    }
}

// ============================================================================
// UI HELPERS
// ============================================================================

/**
 * Toggle visibility of custom header input
 */
function toggleCustomHeader(show) {
    if (show) {
        customHeaderGroup.classList.remove('hidden');
        customHeaderInput.required = true;
    } else {
        customHeaderGroup.classList.add('hidden');
        customHeaderInput.required = false;
    }
}

/**
 * Show save status message
 */
function showSaveStatus(message, type = 'success') {
    saveStatus.textContent = message;
    saveStatus.className = `save-status ${type}`;

    setTimeout(() => {
        saveStatus.textContent = '';
        saveStatus.className = 'save-status';
    }, 2000);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

// Token type radio change - toggle custom header input
document.querySelectorAll('input[name="tokenType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        toggleCustomHeader(e.target.value === 'custom');
    });
});

// Max tokens slider change - update display value
maxTokensSlider.addEventListener('input', (e) => {
    // Enforce 1-5 range (redundant with HTML but explicit)
    const value = Math.min(5, Math.max(1, parseInt(e.target.value, 10)));
    maxTokensValue.textContent = value;
});

// Form submission - save settings
settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Gather form data
    const tokenType = document.querySelector('input[name="tokenType"]:checked').value;
    const tokenSource = document.querySelector('input[name="tokenSource"]:checked').value;

    // Enforce max tokens range (1-5)
    let maxTokens = parseInt(maxTokensSlider.value, 10);
    if (maxTokens > 5) maxTokens = 5;
    if (maxTokens < 1) maxTokens = 1;

    const settings = {
        tokenType: tokenType,
        customHeaderName: tokenType === 'custom' ? customHeaderInput.value.trim() : '',
        tokenSource: tokenSource,
        maxTokens: maxTokens,
        autoCleanup: autoCleanupCheckbox.checked
    };

    // Validate custom header name if custom type selected
    if (tokenType === 'custom' && !settings.customHeaderName) {
        showSaveStatus('Please enter a custom header name', 'error');
        customHeaderInput.focus();
        return;
    }

    try {
        await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: settings });
        showSaveStatus('✅ Settings saved!', 'success');
    } catch (error) {
        console.error('Error saving settings:', error);
        showSaveStatus('Error saving settings', 'error');
    }
});

// Clear data now button
clearNowBtn.addEventListener('click', () => {
    showConfirmModal();
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
        showSaveStatus('✅ All data cleared!', 'success');
    } catch (error) {
        console.error('Error clearing data:', error);
        showSaveStatus('Error clearing data', 'error');
    }
    hideConfirmModal();
});

// Close modal when clicking outside
confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
        hideConfirmModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !confirmModal.classList.contains('hidden')) {
        hideConfirmModal();
    }
});

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', loadSettings);
