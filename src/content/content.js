// Immediately start capturing console logs before anything else
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug
};

// Global storage for captured logs
window.bugReporterCapturedLogs = [];
const maxLogEntries = 100;

// Inject page context console interceptor to forward page logs via postMessage
// Inject page console interceptor script under CSP
(function injectConsoleInterceptor() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/consoleInterceptor.js');
  script.onload = () => script.remove();
  document.documentElement.appendChild(script);
})();

// Inject network interceptor script with settings
(function injectNetworkInterceptor() {
  // Get settings from storage to configure network capture
  chrome.storage.local.get(['settings'], (result) => {
    const settings = result.settings || { captureAllNetworkRequests: false };

    // Set global flag in page context before injecting interceptor
    const settingsScript = document.createElement('script');
    settingsScript.textContent = `window.bugReporterCaptureAllRequests = ${settings.captureAllNetworkRequests || false};`;
    document.documentElement.appendChild(settingsScript);
    settingsScript.remove();

    // Then inject the network interceptor
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/networkInterceptor.js');
    script.onload = () => script.remove();
    document.documentElement.appendChild(script);
  });
})();

// Listen for forwarded page logs and network requests
window.bugReporterCapturedLogs = [];
window.bugReporterNetworkRequests = [];
const maxNetworkRequests = 50;

window.addEventListener('message', event => {
  if (event.source === window && event.data) {
    // Handle console logs
    if (event.data.source === 'bug-reporter') {
      window.bugReporterCapturedLogs.push(event.data.logEntry);
      if (window.bugReporterCapturedLogs.length > maxLogEntries) {
        window.bugReporterCapturedLogs = window.bugReporterCapturedLogs.slice(-maxLogEntries);
      }
    }

    // Handle network requests
    if (event.data.source === 'bug-reporter-network') {
      window.bugReporterNetworkRequests.push(event.data.networkRequest);
      if (window.bugReporterNetworkRequests.length > maxNetworkRequests) {
        window.bugReporterNetworkRequests = window.bugReporterNetworkRequests.slice(-maxNetworkRequests);
      }
    }
  }
});

// Content script for Swift Bug
class BugReporterContent {
  constructor() {
    this.consoleLog = window.bugReporterCapturedLogs || [];
    this.maxLogEntries = 100;
    this.setupErrorCapture();
    this.setupMessageListener();
  }

  setupErrorCapture() {
    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      const logEntry = {
        level: 'error',
        timestamp: new Date().toISOString(),
        message: `Uncaught Error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`
      };

      window.bugReporterCapturedLogs.push(logEntry);

      // Keep only the last N entries
      if (window.bugReporterCapturedLogs.length > maxLogEntries) {
        window.bugReporterCapturedLogs = window.bugReporterCapturedLogs.slice(-maxLogEntries);
      }

      // Update local reference
      this.consoleLog = window.bugReporterCapturedLogs;
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const logEntry = {
        level: 'error',
        timestamp: new Date().toISOString(),
        message: `Unhandled Promise Rejection: ${event.reason}`
      };

      window.bugReporterCapturedLogs.push(logEntry);

      // Keep only the last N entries
      if (window.bugReporterCapturedLogs.length > maxLogEntries) {
        window.bugReporterCapturedLogs = window.bugReporterCapturedLogs.slice(-maxLogEntries);
      }

      // Update local reference
      this.consoleLog = window.bugReporterCapturedLogs;
    });
  }

  setupMessageListener() {
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'getConsoleLog') {
        // Always use the latest captured logs from global storage
        this.consoleLog = window.bugReporterCapturedLogs || [];
        sendResponse({ consoleLog: this.consoleLog });
      } else if (message.action === 'getNetworkRequests') {
        // Return network requests from global storage
        const networkRequests = window.bugReporterNetworkRequests || [];
        sendResponse({ networkRequests: networkRequests });
      }
      return true;
    });
  }

  // Collect all page data that can be accessed from content script
  collectPageData() {
    const data = {
      localStorage: {},
      sessionStorage: {},
      consoleLog: this.consoleLog,
      pageInfo: {
        url: window.location.href,
        title: document.title,
        referrer: document.referrer,
        timestamp: new Date().toISOString(),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        scrollPosition: {
          x: window.scrollX,
          y: window.scrollY
        }
      }
    };

    // Collect localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        data.localStorage[key] = localStorage.getItem(key);
      }
    } catch (error) {
      console.error('BugReporter: Error accessing localStorage:', error);
    }

    // Collect sessionStorage
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        data.sessionStorage[key] = sessionStorage.getItem(key);
      }
    } catch (error) {
      console.error('BugReporter: Error accessing sessionStorage:', error);
    }

    return data;
  }

  // Restore storage data (used during bug restoration)
  restoreStorageData(localStorageData = {}, sessionStorageData = {}) {
    // Clear existing data
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (error) {
      console.error('BugReporter: Error clearing storage:', error);
    }

    // Restore localStorage
    Object.entries(localStorageData).forEach(([key, value]) => {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        console.error('BugReporter: Error setting localStorage item:', key, error);
      }
    });

    // Restore sessionStorage
    Object.entries(sessionStorageData).forEach(([key, value]) => {
      try {
        sessionStorage.setItem(key, value);
      } catch (error) {
        console.error('BugReporter: Error setting sessionStorage item:', key, error);
      }
    });

    console.log('Swift Bug: Storage data restored');
  }

  // Get current page state for debugging
  getPageState() {
    return {
      url: window.location.href,
      title: document.title,
      readyState: document.readyState,
      timestamp: new Date().toISOString(),
      localStorage: Object.keys(localStorage).length,
      sessionStorage: Object.keys(sessionStorage).length,
      consoleLogCount: this.consoleLog.length
    };
  }
}

// Initialize content script
const bugReporterContent = new BugReporterContent();

// Expose methods to global scope for background script access
window.bugReporterContent = bugReporterContent;

// Add a marker to indicate the content script is loaded
window.bugReporterContentLoaded = true;

// Debug log
console.log('BugReporter: Content Script Loaded', bugReporterContent.getPageState());
