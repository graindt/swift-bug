// Content script for Chrome Bug Reporter
class BugReporterContent {
  constructor() {
    this.consoleLog = [];
    this.maxLogEntries = 100;
    this.setupConsoleCapture();
    this.setupMessageListener();
  }

  setupConsoleCapture() {
    // Store original console methods
    const originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug
    };

    // Override console methods to capture logs
    const captureLog = (level, originalMethod) => {
      return (...args) => {
        // Call original method first
        originalMethod.apply(console, args);

        // Capture the log entry
        const logEntry = {
          level: level,
          timestamp: new Date().toISOString(),
          message: args.map(arg => {
            if (typeof arg === 'object') {
              try {
                return JSON.stringify(arg, null, 2);
              } catch (e) {
                return arg.toString();
              }
            }
            return String(arg);
          }).join(' ')
        };

        this.addLogEntry(logEntry);
      };
    };

    // Replace console methods
    console.log = captureLog('log', originalConsole.log);
    console.error = captureLog('error', originalConsole.error);
    console.warn = captureLog('warn', originalConsole.warn);
    console.info = captureLog('info', originalConsole.info);
    console.debug = captureLog('debug', originalConsole.debug);

    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      this.addLogEntry({
        level: 'error',
        timestamp: new Date().toISOString(),
        message: `Uncaught Error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`
      });
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.addLogEntry({
        level: 'error',
        timestamp: new Date().toISOString(),
        message: `Unhandled Promise Rejection: ${event.reason}`
      });
    });
  }

  addLogEntry(logEntry) {
    // Filter out logs from this extension
    if (this.isExtensionLog(logEntry.message)) {
      return;
    }

    this.consoleLog.push(logEntry);

    // Keep only the last N entries
    if (this.consoleLog.length > this.maxLogEntries) {
      this.consoleLog = this.consoleLog.slice(-this.maxLogEntries);
    }

    // Store in window for background script access
    window.bugReporterLogs = this.consoleLog;
  }

  isExtensionLog(message) {
    // Filter patterns for extension-related logs
    const extensionPatterns = [
      'Bug Reporter',
      'BugReporter',
      'bugReporter',
      'Chrome Bug Reporter',
      'Content Script Loaded',
      'Error accessing localStorage',
      'Error accessing sessionStorage',
      'Error clearing storage',
      'Error setting localStorage item',
      'Error setting sessionStorage item',
      'Storage data restored'
    ];

    return extensionPatterns.some(pattern =>
      message.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  setupMessageListener() {
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'getConsoleLog') {
        sendResponse({ consoleLog: this.consoleLog });
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

    console.log('Bug Reporter: Storage data restored');
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
console.log('Bug Reporter Content Script Loaded', bugReporterContent.getPageState());
