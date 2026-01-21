/**
 * Background Service Worker
 * 
 * Responsibilities:
 * - Observe API calls from the active tab using webRequest API
 * - Detect authentication tokens based on configured type and source
 * - Store detected tokens with de-duplication
 * - Handle browser window close for automatic cleanup
 * - Communicate with popup for token display
 */

// ============================================================================
// DEFAULT SETTINGS
// ============================================================================

const DEFAULT_SETTINGS = {
  tokenType: 'bearer',           // 'bearer' | 'session' | 'custom'
  customHeaderName: '',          // Used when tokenType is 'custom'
  tokenSource: 'headers',        // 'headers' | 'storage' | 'cookies'
  maxTokens: 5,                  // Maximum tokens to display (1-5)
  autoCleanup: true              // Clear data on browser close
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

// In-memory storage for detected tokens (cleared on service worker restart)
// Structure: Map<token, { url: string, timestamp: number }>
let detectedTokens = new Map();

// Current active tab ID being monitored
let activeTabId = null;

// ============================================================================
// SETTINGS HELPERS
// ============================================================================

/**
 * Retrieve current settings from storage, with defaults applied
 */
async function getSettings() {
  try {
    const result = await chrome.storage.local.get('settings');
    return { ...DEFAULT_SETTINGS, ...result.settings };
  } catch (error) {
    console.error('Error loading settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save settings to storage
 */
async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

// ============================================================================
// TOKEN EXTRACTION FROM HEADERS
// ============================================================================

/**
 * Extract token from request headers based on configured token type
 * @param {Array} headers - Request headers array
 * @param {Object} settings - Current settings
 * @returns {string|null} - Extracted token or null
 */
function extractTokenFromHeaders(headers, settings) {
  if (!headers || !Array.isArray(headers)) return null;

  for (const header of headers) {
    const name = header.name.toLowerCase();
    const value = header.value;

    switch (settings.tokenType) {
      case 'bearer':
        // Look for Authorization header with Bearer prefix
        if (name === 'authorization') {
          const match = value.match(/^Bearer\s+(.+)$/i);
          if (match) return match[1];
        }
        break;

      case 'session':
        // Look for common session token headers
        if (name === 'x-session-token' || 
            name === 'session-token' || 
            name === 'x-session-id') {
          return value;
        }
        break;

      case 'custom':
        // Look for user-defined header name
        if (settings.customHeaderName && 
            name === settings.customHeaderName.toLowerCase()) {
          return value;
        }
        break;
    }
  }

  return null;
}

// ============================================================================
// TOKEN STORAGE & DE-DUPLICATION
// ============================================================================

/**
 * Add a detected token with de-duplication
 * Same token appearing multiple times is stored only once
 * @param {string} token - The token value
 * @param {string} url - The URL where token was found
 * @param {number} maxTokens - Maximum tokens to store
 */
async function addToken(token, url, maxTokens) {
  // De-duplication: If token already exists, don't add again
  if (detectedTokens.has(token)) {
    return;
  }

  // Enforce maximum token limit
  if (detectedTokens.size >= maxTokens) {
    return; // Ignore additional tokens beyond limit
  }

  // Store token with its first associated URL
  detectedTokens.set(token, {
    url: url,
    timestamp: Date.now()
  });

  // Persist to storage for popup access
  await persistTokens();

  // Notify popup if open
  notifyPopup();
}

/**
 * Persist tokens to chrome.storage.session for popup access
 */
async function persistTokens() {
  const tokenList = [];
  detectedTokens.forEach((data, token) => {
    tokenList.push({
      token: token,
      url: data.url,
      timestamp: data.timestamp
    });
  });

  await chrome.storage.session.set({ tokens: tokenList });
}

/**
 * Notify popup of token updates via messaging
 */
function notifyPopup() {
  chrome.runtime.sendMessage({ type: 'TOKENS_UPDATED' }).catch(() => {
    // Popup not open, ignore error
  });
}

// ============================================================================
// WEB REQUEST LISTENER
// ============================================================================

/**
 * Handler for incoming web requests
 * Only processes requests from the active tab
 */
async function handleWebRequest(details) {
  // Only observe requests from the active tab
  if (details.tabId !== activeTabId) {
    return;
  }

  const settings = await getSettings();

  // Only process if source is headers
  if (settings.tokenSource !== 'headers') {
    return;
  }

  // Extract token from request headers
  const token = extractTokenFromHeaders(details.requestHeaders, settings);

  // Ignore requests without matching tokens (event-driven detection)
  if (!token) {
    return;
  }

  // Add token with de-duplication and limit enforcement
  await addToken(token, details.url, settings.maxTokens);
}

// ============================================================================
// ACTIVE TAB TRACKING
// ============================================================================

/**
 * Update the currently active tab and clear tokens for new tab
 */
async function updateActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.id !== activeTabId) {
      activeTabId = tab.id;
      
      // Clear tokens when switching tabs (only observe active tab)
      detectedTokens.clear();
      await persistTokens();
      notifyPopup();
    }
  } catch (error) {
    console.error('Error updating active tab:', error);
  }
}

// Listen for tab activation changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  activeTabId = activeInfo.tabId;
  
  // Clear tokens for new tab
  detectedTokens.clear();
  await persistTokens();
  notifyPopup();
});

// Listen for tab updates (e.g., navigation)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId === activeTabId && changeInfo.status === 'loading') {
    // Clear tokens on page navigation
    detectedTokens.clear();
    await persistTokens();
    notifyPopup();
  }
});

// Initialize active tab on service worker start
updateActiveTab();

// ============================================================================
// WEB REQUEST LISTENER SETUP
// ============================================================================

// Listen to all web requests with request headers
chrome.webRequest.onBeforeSendHeaders.addListener(
  handleWebRequest,
  { urls: ['<all_urls>'] },
  ['requestHeaders']
);

// ============================================================================
// STORAGE & COOKIES EXTRACTION (On-Demand)
// ============================================================================

/**
 * Extract tokens from browser storage (localStorage/sessionStorage)
 * Called on-demand when popup requests it
 * @param {number} tabId - Tab to extract from
 * @param {Object} settings - Current settings
 */
async function extractTokensFromStorage(tabId, settings) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (tokenType, customHeaderName) => {
        const tokens = [];
        
        // Define patterns to look for based on token type
        const patterns = {
          bearer: ['token', 'access_token', 'accessToken', 'auth_token', 'authToken', 'bearer'],
          session: ['session', 'sessionToken', 'session_token', 'sessionId', 'session_id'],
          custom: customHeaderName ? [customHeaderName.toLowerCase()] : []
        };

        const searchPatterns = patterns[tokenType] || patterns.bearer;

        // Search in localStorage
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          const keyLower = key.toLowerCase();
          
          for (const pattern of searchPatterns) {
            if (keyLower.includes(pattern.toLowerCase())) {
              const value = localStorage.getItem(key);
              if (value && value.length > 10) { // Basic validation
                tokens.push({
                  token: value,
                  url: `localStorage:${key}`
                });
              }
              break;
            }
          }
        }

        // Search in sessionStorage
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          const keyLower = key.toLowerCase();
          
          for (const pattern of searchPatterns) {
            if (keyLower.includes(pattern.toLowerCase())) {
              const value = sessionStorage.getItem(key);
              if (value && value.length > 10) { // Basic validation
                tokens.push({
                  token: value,
                  url: `sessionStorage:${key}`
                });
              }
              break;
            }
          }
        }

        return tokens;
      },
      args: [settings.tokenType, settings.customHeaderName]
    });

    return results[0]?.result || [];
  } catch (error) {
    console.error('Error extracting from storage:', error);
    return [];
  }
}

/**
 * Extract tokens from cookies
 * @param {string} url - URL to get cookies for
 * @param {Object} settings - Current settings
 */
async function extractTokensFromCookies(url, settings) {
  try {
    const cookies = await chrome.cookies.getAll({ url: url });
    const tokens = [];

    // Define patterns to look for based on token type
    const patterns = {
      bearer: ['token', 'access_token', 'auth_token', 'bearer', 'jwt'],
      session: ['session', 'sessionid', 'session_id', 'sid'],
      custom: settings.customHeaderName ? [settings.customHeaderName.toLowerCase()] : []
    };

    const searchPatterns = patterns[settings.tokenType] || patterns.bearer;

    for (const cookie of cookies) {
      const nameLower = cookie.name.toLowerCase();
      
      for (const pattern of searchPatterns) {
        if (nameLower.includes(pattern.toLowerCase())) {
          if (cookie.value && cookie.value.length > 10) { // Basic validation
            tokens.push({
              token: cookie.value,
              url: `cookie:${cookie.name}`
            });
          }
          break;
        }
      }
    }

    return tokens;
  } catch (error) {
    console.error('Error extracting from cookies:', error);
    return [];
  }
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'GET_TOKENS':
        // Return currently detected tokens
        const tokenList = [];
        detectedTokens.forEach((data, token) => {
          tokenList.push({
            token: token,
            url: data.url,
            timestamp: data.timestamp
          });
        });
        sendResponse({ tokens: tokenList });
        break;

      case 'SCAN_STORAGE':
        // On-demand scan from storage/cookies
        const settings = await getSettings();
        let foundTokens = [];

        if (settings.tokenSource === 'storage') {
          foundTokens = await extractTokensFromStorage(activeTabId, settings);
        } else if (settings.tokenSource === 'cookies') {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.url) {
            foundTokens = await extractTokensFromCookies(tab.url, settings);
          }
        }

        // Add found tokens with de-duplication
        for (const item of foundTokens) {
          await addToken(item.token, item.url, settings.maxTokens);
        }

        // Return updated token list
        const updatedList = [];
        detectedTokens.forEach((data, token) => {
          updatedList.push({
            token: token,
            url: data.url,
            timestamp: data.timestamp
          });
        });
        sendResponse({ tokens: updatedList });
        break;

      case 'CLEAR_DATA':
        // Manual clear data action
        detectedTokens.clear();
        await chrome.storage.session.clear();
        await persistTokens();
        sendResponse({ success: true });
        break;

      case 'GET_SETTINGS':
        const currentSettings = await getSettings();
        sendResponse({ settings: currentSettings });
        break;

      case 'SAVE_SETTINGS':
        await saveSettings(message.settings);
        // Clear tokens when settings change
        detectedTokens.clear();
        await persistTokens();
        sendResponse({ success: true });
        break;

      case 'GET_ACTIVE_TAB_ID':
        sendResponse({ tabId: activeTabId });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();

  // Return true to indicate async response
  return true;
});

// ============================================================================
// BROWSER WINDOW CLOSE CLEANUP
// ============================================================================

/**
 * Clear all data when browser windows close
 * This ensures no data persists across browser restarts
 */
chrome.windows.onRemoved.addListener(async (windowId) => {
  try {
    // Check if there are any remaining windows
    const windows = await chrome.windows.getAll();
    
    if (windows.length === 0) {
      // Last window closed - clear all data
      const settings = await getSettings();
      
      if (settings.autoCleanup) {
        detectedTokens.clear();
        await chrome.storage.session.clear();
        await chrome.storage.local.remove('tokens');
        console.log('Browser closed - all extension data cleared');
      }
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
});

// ============================================================================
// SERVICE WORKER INITIALIZATION
// ============================================================================

console.log('API Token Extractor: Background service worker initialized');
