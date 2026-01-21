# API Token Extractor - Chrome Extension

A Chrome browser extension that allows users to extract and copy API authentication tokens used by the currently active browser tab.

## 📁 Folder Structure

```
Extension/
├── manifest.json          # Chrome MV3 manifest configuration
├── background.js          # Service worker for token detection
├── popup.html             # Popup UI structure
├── popup.js               # Popup logic and interactions
├── settings.html          # Settings page structure
├── settings.js            # Settings logic and persistence
├── styles/
│   ├── popup.css          # Popup styling
│   └── settings.css       # Settings page styling
├── icons/
│   ├── icon16.svg         # 16x16 extension icon
│   ├── icon48.svg         # 48x48 extension icon
│   └── icon128.svg        # 128x128 extension icon
└── README.md              # This file
```

## 🚀 Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `Extension` folder
5. The extension icon will appear in the toolbar

## 📖 Usage

### Basic Usage

1. Navigate to a website that makes authenticated API calls
2. Click the extension icon to open the popup
3. API tokens will be automatically detected from request headers
4. Click **Copy Token** on any detected token to copy it to clipboard

### Token Detection

The extension supports three **token types**:
- **Authorization Bearer** (default): Detects `Authorization: Bearer <token>` headers
- **Session Token**: Detects session-related headers (X-Session-Token, etc.)
- **Custom Header**: User-defined header name

The extension supports three **token sources**:
- **API Request Headers** (default): Intercepts outgoing API requests
- **Browser Storage**: Scans localStorage and sessionStorage
- **Cookies**: Scans browser cookies

### Settings

Click the ⚙️ button to access settings:
- **Token Type**: Select which type of token to detect
- **Token Source**: Select where to look for tokens
- **Maximum Tokens**: Limit displayed tokens (1-5)
- **Auto-cleanup**: Clear data when browser closes (enabled by default)
- **Clear All Data Now**: Manually clear all stored data

## 🔒 Privacy & Security

- **Active Tab Only**: Only monitors the currently active tab
- **No External Transmission**: Tokens are never sent externally
- **No Auto-Copy**: Requires explicit user action to copy tokens
- **Auto-Cleanup**: All data cleared on browser close (configurable)
- **Session Storage**: Tokens stored in session storage, not persistent

## ⚙️ Configuration Options

| Setting | Options | Default | Description |
|---------|---------|---------|-------------|
| Token Type | Bearer, Session, Custom | Bearer | Type of token to detect |
| Token Source | Headers, Storage, Cookies | Headers | Where to scan for tokens |
| Max Tokens | 1-5 | 5 | Maximum URL-token pairs to display |
| Auto-Cleanup | On/Off | On | Clear data on browser close |

## 🛠️ Technical Details

### Token De-duplication
- Identical tokens appearing in multiple requests are shown only once
- Each unique token is associated with the first URL where it was detected

### Event-Driven Detection
- Tokens are detected as API calls are made
- No polling or time-based scanning for header-based detection
- Storage/Cookie scanning is on-demand (click "Scan" button)

### Manifest V3 Compliance
- Uses service worker instead of background page
- Uses `chrome.storage.session` for temporary data
- Follows Chrome's security best practices

## 📝 Notes

- The extension requires page refresh after changing settings
- DevTools is **not** required for the extension to work
- Token masking shows first 4 and last 4 characters only

## 🐛 Troubleshooting

**No tokens detected?**
- Ensure the website is making authenticated API calls
- Check if the token type matches your target (Bearer vs Session)
- For storage/cookies, click the "Scan" button manually

**Extension not working on certain sites?**
- Some sites use content security policies that may limit functionality
- Try refreshing the page after installing the extension

## 📜 License

MIT License - Free for personal and commercial use.
