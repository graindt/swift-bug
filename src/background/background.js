// Background service worker for Chrome Bug Reporter
class BugReporterBackground {
  constructor() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Handle messages from popup and content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async response
    });

    // Handle extension installation
    chrome.runtime.onInstalled.addListener(() => {
      this.initializeStorage();
    });
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'saveBugReport':
          const result = await this.saveBugReport(message.data);
          sendResponse({ success: true, data: result });
          break;

        case 'getBugReports':
          const reports = await this.getBugReports();
          sendResponse({ success: true, data: reports });
          break;

        case 'deleteBugReport':
          await this.deleteBugReport(message.reportId);
          sendResponse({ success: true });
          break;

        case 'exportBugReport':
          await this.exportBugReport(message.reportId);
          sendResponse({ success: true });
          break;

        case 'collectPageData':
          const pageData = await this.collectPageData(sender.tab);
          sendResponse({ success: true, data: pageData });
          break;

        case 'restoreBugData':
          await this.restoreBugData(message.data, sender.tab);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Background script error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async initializeStorage() {
    const result = await chrome.storage.local.get(['bugReports', 'settings']);

    if (!result.bugReports) {
      await chrome.storage.local.set({ bugReports: {} });
    }

    if (!result.settings) {
      await chrome.storage.local.set({
        settings: {
          maxStoredReports: 50,
          includeScreenshot: true,
          includeNetworkRequests: false,
          maxConsoleLines: 100
        }
      });
    }
  }

  async collectPageData(tab) {
    const pageData = {
      url: tab.url,
      title: tab.title,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };

    // Collect cookies
    try {
      const url = new URL(tab.url);
      const cookies = await chrome.cookies.getAll({ domain: url.hostname });
      pageData.cookies = cookies;
    } catch (error) {
      console.error('Error collecting cookies:', error);
      pageData.cookies = [];
    }

    // Inject content script to collect page storage data
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: this.collectStorageData
      });

      if (results && results[0] && results[0].result) {
        Object.assign(pageData, results[0].result);
      }
    } catch (error) {
      console.error('Error collecting storage data:', error);
      pageData.localStorage = {};
      pageData.sessionStorage = {};
      pageData.consoleLog = [];
    }

    // Take screenshot
    try {
      const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      pageData.screenshot = screenshot;
    } catch (error) {
      console.error('Error taking screenshot:', error);
      pageData.screenshot = null;
    }

    return pageData;
  }

  // Function to be injected into page to collect storage data
  collectStorageData() {
    const data = {
      localStorage: {},
      sessionStorage: {},
      consoleLog: []
    };

    // Collect localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        data.localStorage[key] = localStorage.getItem(key);
      }
    } catch (error) {
      console.error('Error accessing localStorage:', error);
    }

    // Collect sessionStorage
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        data.sessionStorage[key] = sessionStorage.getItem(key);
      }
    } catch (error) {
      console.error('Error accessing sessionStorage:', error);
    }

    // Get console logs if they were captured by content script
    if (window.bugReporterLogs) {
      data.consoleLog = window.bugReporterLogs.slice(-100); // Last 100 logs
    }

    return data;
  }

  async saveBugReport(reportData) {
    const reportId = `bug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const bugReport = {
      id: reportId,
      timestamp: new Date().toISOString(),
      title: reportData.title || `Bug Report - ${new URL(reportData.url).hostname}`,
      description: reportData.description || '',
      ...reportData
    };

    // Get current reports
    const result = await chrome.storage.local.get(['bugReports', 'settings']);
    const bugReports = result.bugReports || {};
    const settings = result.settings || { maxStoredReports: 50 };

    // Add new report
    bugReports[reportId] = bugReport;

    // Check if we need to remove old reports
    const reportIds = Object.keys(bugReports);
    if (reportIds.length > settings.maxStoredReports) {
      // Sort by timestamp and remove oldest
      reportIds.sort((a, b) =>
        new Date(bugReports[a].timestamp) - new Date(bugReports[b].timestamp)
      );

      const toRemove = reportIds.slice(0, reportIds.length - settings.maxStoredReports);
      toRemove.forEach(id => delete bugReports[id]);
    }

    // Save updated reports
    await chrome.storage.local.set({ bugReports });

    return bugReport;
  }

  async getBugReports() {
    const result = await chrome.storage.local.get(['bugReports']);
    const bugReports = result.bugReports || {};

    // Convert to array and sort by timestamp (newest first)
    return Object.values(bugReports).sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    );
  }

  async deleteBugReport(reportId) {
    const result = await chrome.storage.local.get(['bugReports']);
    const bugReports = result.bugReports || {};

    delete bugReports[reportId];
    await chrome.storage.local.set({ bugReports });
  }

  async exportBugReport(reportId) {
    const result = await chrome.storage.local.get(['bugReports']);
    const bugReports = result.bugReports || {};
    const report = bugReports[reportId];

    if (!report) {
      throw new Error('Bug report not found');
    }

    // Create export data with version info
    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      report: report
    };

    // Create filename
    const date = new Date(report.timestamp);
    const domain = new URL(report.url).hostname;
    const filename = `bug-report-${domain}-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${Date.now()}.json`;

    // Download file
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });

    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async restoreBugData(bugData, tab) {
    // Navigate to the bug URL if different
    if (tab.url !== bugData.url) {
      await chrome.tabs.update(tab.id, { url: bugData.url });

      // Wait for navigation to complete
      return new Promise((resolve) => {
        const listener = (tabId, changeInfo) => {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            setTimeout(() => this.injectBugData(bugData, tab.id).then(resolve), 1000);
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    } else {
      return this.injectBugData(bugData, tab.id);
    }
  }

  async injectBugData(bugData, tabId) {
    // Restore cookies
    if (bugData.cookies && bugData.cookies.length > 0) {
      for (const cookie of bugData.cookies) {
        try {
          await chrome.cookies.set({
            url: `${cookie.secure ? 'https' : 'http'}://${cookie.domain}${cookie.path}`,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            expirationDate: cookie.expirationDate
          });
        } catch (error) {
          console.error('Error setting cookie:', error);
        }
      }
    }

    // Inject storage data
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: this.injectStorageData,
        args: [bugData.localStorage || {}, bugData.sessionStorage || {}]
      });
    } catch (error) {
      console.error('Error injecting storage data:', error);
    }

    // Refresh the page to apply all changes
    await chrome.tabs.reload(tabId);
  }

  // Function to be injected to restore storage data
  injectStorageData(localStorageData, sessionStorageData) {
    // Restore localStorage
    Object.entries(localStorageData).forEach(([key, value]) => {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        console.error('Error setting localStorage item:', error);
      }
    });

    // Restore sessionStorage
    Object.entries(sessionStorageData).forEach(([key, value]) => {
      try {
        sessionStorage.setItem(key, value);
      } catch (error) {
        console.error('Error setting sessionStorage item:', error);
      }
    });
  }
}

// Initialize background script
new BugReporterBackground();
