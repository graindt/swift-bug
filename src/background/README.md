# Background Script Architecture

This document describes the modular architecture of the background script after refactoring.

## Module Structure

The background script has been refactored into the following modules:

### 1. BugReportManager (`modules/BugReportManager.js`)
**Responsibilities:**
- Managing bug report storage and retrieval
- Importing and exporting bug reports
- Fetching bug reports from URLs
- Caching mechanisms for remote bug reports

**Key Methods:**
- `saveBugReport(reportData)` - Save a new bug report
- `getBugReports()` - Get all stored bug reports
- `deleteBugReport(reportId)` - Delete a specific bug report
- `deleteAllBugReports()` - Clear all bug reports
- `exportBugReport(reportId)` - Export bug report to JSON file
- `importBugReport(bugData)` - Import bug report from external data
- `fetchBugReportFromUrl(url)` - Fetch bug report from remote URL

### 2. DataCollector (`modules/DataCollector.js`)
**Responsibilities:**
- Collecting page data from active tabs
- Gathering cookies, storage, console logs, network requests
- Taking screenshots and viewport information
- Tab management utilities

**Key Methods:**
- `getCurrentActiveTab()` - Get the currently active tab
- `collectPageData(tab)` - Collect comprehensive page data
- `_collectCookies(pageData)` - Collect cookies for the page
- `_collectBrowserData(tab, pageData)` - Collect storage and console data
- `_collectViewportInfo(tab, pageData)` - Collect viewport information
- `_takeScreenshot(tab, pageData, settings)` - Capture page screenshot

### 3. BugDataRestorer (`modules/BugDataRestorer.js`)
**Responsibilities:**
- Restoring bug data to web pages
- Managing cross-domain navigation
- Injecting cookies, storage, and other data
- Localhost restoration functionality

**Key Methods:**
- `restoreBugData(bugData, tab)` - Restore bug data to a tab
- `injectBugData(bugData, tabId)` - Inject bug data into a specific tab
- `restoreBugDataToLocal(bugData, settings)` - Restore bug data to localhost
- `_clearExistingData(tabId, url)` - Clear existing page data
- `_restoreCookies(bugData, reportOrigin)` - Restore cookies
- `_injectStorageData(tabId, bugData)` - Inject localStorage/sessionStorage

### 4. StorageManager (`modules/StorageManager.js`)
**Responsibilities:**
- Managing Chrome extension storage
- Settings management
- Cache management
- Storage initialization

**Key Methods:**
- `initializeStorage()` - Initialize storage with default values
- `getSettings()` - Get current settings
- `updateSettings(newSettings)` - Update settings
- `clearCache()` - Clear bug report cache
- `getCacheInfo()` - Get cache statistics

### 5. MessageHandler (`modules/MessageHandler.js`)
**Responsibilities:**
- Handling messages from popup and content scripts
- Routing actions to appropriate modules
- Error handling and response formatting

**Key Methods:**
- `handleMessage(message, sender, sendResponse)` - Main message handler

## Main Background Script (`background.js`)

The main background script now serves as a coordinator that:
1. Imports all required modules using `importScripts()`
2. Initializes module instances
3. Sets up event listeners
4. Delegates functionality to appropriate modules

## Benefits of This Architecture

1. **Separation of Concerns**: Each module has a clear, single responsibility
2. **Maintainability**: Easier to locate and modify specific functionality
3. **Testability**: Individual modules can be tested in isolation
4. **Extensibility**: New features can be added by creating new modules or extending existing ones
5. **Reusability**: Modules can potentially be reused in other parts of the extension

## Extension Guidelines

When adding new functionality:

1. **Determine the appropriate module** - Place new methods in the module that best fits the functionality
2. **Create new modules** - If functionality doesn't fit existing modules, create a new module
3. **Update MessageHandler** - Add new message actions to the MessageHandler if needed
4. **Maintain consistency** - Follow the same patterns established by existing modules
5. **Error handling** - Ensure proper error handling and logging in all methods

## Module Dependencies

```
Background.js
├── StorageManager (independent)
├── BugReportManager (uses StorageManager internally for settings)
├── DataCollector (independent)
├── BugDataRestorer (independent)
└── MessageHandler (coordinates all other modules)
```

The architecture ensures loose coupling between modules while maintaining clear data flow and responsibilities.
