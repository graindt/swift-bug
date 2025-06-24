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
          // Get current active tab if sender.tab is not available
          const tab = sender.tab || await this.getCurrentActiveTab();
          const pageData = await this.collectPageData(tab);
          sendResponse({ success: true, data: pageData });
          break;

        case 'restoreBugData':
          // Get current active tab if sender.tab is not available
          const restoreTab = sender.tab || await this.getCurrentActiveTab();
          await this.restoreBugData(message.data, restoreTab);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('BugReporter: Background script error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async getCurrentActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
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
          includeNetworkRequests: true,
          captureAllNetworkRequests: false, // Only capture failed requests by default
          maxConsoleLines: 100,
          maxNetworkRequests: 50,
          maxRequestBodySize: 10240,
          ignoreStaticResources: true
        }
      });
    }
  }

  async collectPageData(tab) {
    if (!tab) {
      throw new Error('No active tab found');
    }

    const pageData = {
      url: tab.url,
      title: tab.title,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };

    // Get the complete URL including hash from the page
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.location.href
      });

      if (results && results[0] && results[0].result) {
        pageData.url = results[0].result; // This includes the hash
      }
    } catch (error) {
      console.error('BugReporter: Error getting complete URL with hash:', error);
      // Fall back to tab.url if injection fails
    }

    // Collect ALL cookies for the current page
    try {
      const url = new URL(pageData.url);

      // Get cookies for the exact URL
      const exactUrlCookies = await chrome.cookies.getAll({ url: pageData.url });

      // Get cookies for the domain and its subdomains (current domain only)
      const domainCookies = await chrome.cookies.getAll({ domain: url.hostname });

      // Combine and deduplicate cookies (no parent domain fetch)
      const allCookies = [...exactUrlCookies, ...domainCookies];
      const uniqueCookies = allCookies.filter((cookie, index, self) =>
        index === self.findIndex(c => c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path)
      );

      pageData.cookies = uniqueCookies;
      console.log(`BugReporter: Collected ${uniqueCookies.length} cookies for ${url.hostname}`);
    } catch (error) {
      console.error('BugReporter: Error collecting cookies:', error);
      pageData.cookies = [];
    }

    // Collect storage data using content script message
    try {
      // First try to get data from content script via message
      const contentScriptData = await chrome.tabs.sendMessage(tab.id, { action: 'getConsoleLog' });

      if (contentScriptData && contentScriptData.consoleLog) {
        pageData.consoleLog = contentScriptData.consoleLog;
      } else {
        pageData.consoleLog = [];
      }

      // Get network requests from content script
      const networkData = await chrome.tabs.sendMessage(tab.id, { action: 'getNetworkRequests' });
      if (networkData && networkData.networkRequests) {
        pageData.networkRequests = networkData.networkRequests;
        console.log(`BugReporter: Collected ${networkData.networkRequests.length} network requests`);
      } else {
        pageData.networkRequests = [];
        console.log('BugReporter: No network requests found');
      }

      // Inject script to collect storage data (localStorage/sessionStorage)
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const data = {
            localStorage: {},
            sessionStorage: {}
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

          return data;
        }
      });

      if (results && results[0] && results[0].result) {
        Object.assign(pageData, results[0].result);
      }
    } catch (error) {
      console.error('BugReporter: Error collecting storage data:', error);
      pageData.localStorage = {};
      pageData.sessionStorage = {};
      pageData.consoleLog = [];
      pageData.networkRequests = [];
    }

    // Take screenshot
    try {
      const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      pageData.screenshot = screenshot;
    } catch (error) {
      console.error('BugReporter: Error taking screenshot:', error);
      pageData.screenshot = null;
    }

    return pageData;
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

    // Download file using data URI (service worker context)
    const jsonStr = JSON.stringify(exportData, null, 2);
    const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr);

    await chrome.downloads.download({ url, filename, saveAs: true });

    // No need to revoke data URI
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
    // Use the original report URL origin for setting cookies
    const reportOrigin = new URL(bugData.url).origin;
     // Restore cookies
     if (bugData.cookies && bugData.cookies.length > 0) {
       for (const cookie of bugData.cookies) {
         try {
          // Construct URL using report origin and cookie path
          const url = `${reportOrigin}${cookie.path}`;
           await chrome.cookies.set({
             url,
             name: cookie.name,
             value: cookie.value,
             domain: cookie.domain,
             path: cookie.path,
             secure: cookie.secure,
             httpOnly: cookie.httpOnly,
             expirationDate: cookie.expirationDate
           });
         } catch (error) {
           console.error('BugReporter: Error setting cookie:', error);
         }
       }
     }

     // Inject storage data
     try {
       await chrome.scripting.executeScript({
         target: { tabId },
         func: (localStorageData, sessionStorageData) => {
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
         },
         args: [bugData.localStorage || {}, bugData.sessionStorage || {}]
       });
       console.log('BugReporter: injectBugData: storage data injected for tab', tabId);
     } catch (error) {
       console.error('BugReporter: Error injecting storage data:', error);
     }

     // Refresh the page to apply all changes
     await chrome.tabs.reload(tabId);
     console.log('BugReporter: injectBugData: page reloaded for tab', tabId);
   }

}

// Initialize background script
new BugReporterBackground();
