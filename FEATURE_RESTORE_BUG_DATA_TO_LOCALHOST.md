# Feature: Restore Bug Data to Localhost

This document outlines the implementation of a new feature that allows users to restore bug data to a local development environment instead of the default production server.

## 1. Options Page (`src/options/`)

A new setting will be added to the options page to manage the localhost restore functionality.

### UI Changes (`options.html`)

A text input field will be provided for the user to specify the localhost endpoint URL (e.g., `http://localhost:8080/bug-report`).

```html
<!-- Example HTML structure -->
<div>
    <label for="localhostEndpoint">Localhost Endpoint URL:</label>
    <input type="text" id="localhostEndpoint" placeholder="http://localhost:8080">
</div>
<button id="save">Save</button>
```

### Logic Changes (`options.js`)

- The script will save the endpoint URL to `chrome.storage.sync`.
- It will also load the saved settings when the options page is opened.

## 2. Popup Page (`src/popup/`)

A new button will be added to the popup UI for each bug entry, allowing the user to trigger the restore action for a specific bug.

### UI Changes (`popup.html`)

- For each bug item displayed in the list, a new button labeled "还原为Local" (Restore to Local) will be added.

### Logic Changes (`popup.js` & `services/BugReportService.js`)

- An event listener is attached to each "还原为Local" button in `popup.js`.
- When clicked, it calls the `restoreReportToLocal` method in `BugReportService.js`.
- The `BugReportService` sends a `restoreBugDataToLocal` message to the background script (`background.js`) with the bug report data.

## 3. Background Script (`src/background/background.js`)

The background script contains the core logic for the feature.

### Message Handler (`restoreBugDataToLocal`)

- A new message listener handles the `restoreBugDataToLocal` action.
- It retrieves the `localhostEndpoint` from `chrome.storage.local`.
- It creates a deep copy of the bug report data to avoid modifying the original.
- **Cookie Transformation**: It iterates through the cookies in the copied report and changes their `domain` to match the localhost URL's hostname. It also removes the `secure` attribute for `http` endpoints.
- **Tab Management**: It opens a new tab pointing to the `localhostEndpoint`.
- **Data Injection**: After the new tab has loaded, it uses the existing `injectBugData` function to inject the modified cookies and storage (localStorage, sessionStorage) into the page.

## 4. Manifest (`src/manifest.json`)

- The `host_permissions` section with `<all_urls>` is sufficient to allow the extension to interact with local servers.
- The `storage` permission is required if not already present.

## 5. Development and Testing

- A mock local server can be set up to receive and log the bug data to verify the feature works as expected.
- The `test-bug-links.html` or a new test page can be used to generate sample bugs for testing the restore functionality.
