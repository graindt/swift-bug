// Background service worker for Swift Bug
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

        case 'saveBugSnapshotFromFab':
          // 1. 获取当前激活标签页
          const fabTab = sender.tab || await this.getCurrentActiveTab();
          // 2. 收集页面数据
          const fabPageData = await this.collectPageData(fabTab);
          // 3. 保存 bug 报告（无需填写标题/描述）
          await this.saveBugReport(fabPageData);
          // 4. 可选：通知 content script 显示保存成功提示
          sendResponse({ success: true });
          break;

        case 'fetchBugReportFromUrl':
          try {
            const bugReportData = await this.fetchBugReportFromUrl(message.url);
            sendResponse({ success: true, data: bugReportData });
          } catch (error) {
            console.error('BugReporter: Error fetching bug report from URL:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'importBugReport':
          try {
            const importResult = await this.importBugReport(message.data);
            sendResponse({ success: true, data: importResult });
          } catch (error) {
            console.error('BugReporter: Error importing bug report:', error);
            sendResponse({ success: false, error: error.message });
          }
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
    const result = await chrome.storage.local.get(['bugReports', 'settings', 'bugReportCache']);

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
    // Initialize cache for fetched bug reports
    if (!result.bugReportCache) {
      await chrome.storage.local.set({ bugReportCache: {} });
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
    // Add settings retrieval for screenshot flag
    let settings = { includeScreenshot: true };
    try {
      const resultSettings = await chrome.storage.local.get(['settings']);
      settings = resultSettings.settings || {};
    } catch (error) {
      console.error('BugReporter: Error retrieving settings:', error);
      settings = {};
    }

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
        console.log(`BugReporter: Collected ${networkData.networkRequests.length} network requests`, networkData.networkRequests);
      } else {
        pageData.networkRequests = [];
        console.log('BugReporter: No network requests found, networkData:', networkData);
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

    // Collect viewport info
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: () => {
          const width = window.innerWidth;
          const height = window.innerHeight;
          const scrollX = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
          const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
          return { width, height, scrollX, scrollY };
        }
      });
      if (results && results[0] && results[0].result) {
        pageData.viewport = results[0].result;
      }
    } catch (error) {
      console.error('BugReporter: Error collecting viewport info:', error);
      pageData.viewport = {};
    }

    // Take screenshot
    if (settings.includeScreenshot) {
      try {
        const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        pageData.screenshot = screenshot;
      } catch (error) {
        console.error('BugReporter: Error taking screenshot:', error);
        pageData.screenshot = null;
      }
    } else {
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
    const filename = `swiftswiftbug-report-${domain}-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${Date.now()}.json`;

    // Download file using data URI (service worker context)
    const jsonStr = JSON.stringify(exportData, null, 2);
    const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr);

    await chrome.downloads.download({ url, filename, saveAs: true });

    // No need to revoke data URI
  }

  async restoreBugData(bugData, tab) {
    // Save bugData if id does not exist in storage
    const result = await chrome.storage.local.get(['bugReports']);
    const bugReports = result.bugReports || {};
    if (!bugData.id || !bugReports[bugData.id]) {
      // Generate id if missing
      const reportId = bugData.id || `bug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const bugReport = {
        id: reportId,
        timestamp: bugData.timestamp || new Date().toISOString(),
        title: bugData.title || `Bug Report - ${new URL(bugData.url).hostname}`,
        description: bugData.description || '',
        ...bugData
      };
      bugReports[reportId] = bugReport;
      await chrome.storage.local.set({ bugReports });
    }
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

  async importBugReport(bugData) {
    try {
      console.log('BugReporter: Importing bug report:', bugData.id || 'unnamed');

      // Validate bug data format
      if (!bugData.url || !bugData.timestamp) {
        throw new Error('Invalid bug report format: missing required fields');
      }

      // Generate ID if missing
      const reportId = bugData.id || `bug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create bug report with proper structure
      const bugReport = {
        id: reportId,
        timestamp: bugData.timestamp,
        title: bugData.title || `Bug Report - ${new URL(bugData.url).hostname}`,
        description: bugData.description || '',
        url: bugData.url,
        userAgent: bugData.userAgent || 'Unknown',
        localStorage: bugData.localStorage || {},
        sessionStorage: bugData.sessionStorage || {},
        cookies: bugData.cookies || [],
        consoleLog: bugData.consoleLog || [],
        networkRequests: bugData.networkRequests || [],
        screenshot: bugData.screenshot || null
      };

      // Get current reports and settings
      const result = await chrome.storage.local.get(['bugReports', 'settings']);
      const bugReports = result.bugReports || {};
      const settings = result.settings || { maxStoredReports: 50 };

      // Check if report already exists
      if (bugReports[reportId]) {
        console.log('BugReporter: Report already exists, updating...');
      }

      // Add/update report
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
        console.log(`BugReporter: Removed ${toRemove.length} old reports to stay within limit`);
      }

      // Save updated reports
      await chrome.storage.local.set({ bugReports });

      console.log('BugReporter: Bug report imported successfully:', reportId);
      return { id: reportId, imported: true };

    } catch (error) {
      console.error('BugReporter: Error importing bug report:', error);
      throw error;
    }
  }

  async fetchBugReportFromUrl(url) {
    try {
      // Cache lookup
      const { bugReportCache = {} } = await chrome.storage.local.get(['bugReportCache']);
      if (bugReportCache[url]) {
        console.log('BugReporter: Returning cached bug report for URL:', url);
        return bugReportCache[url].data;
      }
      console.log('BugReporter: Fetching bug report from URL:', url);

       // Fetch the JSON file
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // Try to parse as JSON anyway, in case the server doesn't set correct content-type
        console.warn('BugReporter: Content-Type is not application/json, but attempting to parse as JSON');
      }

      const jsonData = await response.json();
      let reportData;
      // Check if this is an exported bug report format
      if (jsonData.report) {
        console.log('BugReporter: Found exported bug report format');
        reportData = jsonData.report;
      } else if (jsonData.url && jsonData.timestamp) {
        console.log('BugReporter: Found direct bug report format');
        reportData = jsonData;
      } else {
        throw new Error('不是有效的Bug报告格式');
      }
      // Store in cache
      const now = Date.now();
      bugReportCache[url] = { data: reportData, fetchedAt: now };
      // Evict oldest entries if cache size exceeds 100
      const cacheKeys = Object.keys(bugReportCache);
      if (cacheKeys.length > 100) {
        cacheKeys.sort((a, b) => bugReportCache[a].fetchedAt - bugReportCache[b].fetchedAt);
        const removeCount = cacheKeys.length - 100;
        cacheKeys.slice(0, removeCount).forEach(key => delete bugReportCache[key]);
      }
      await chrome.storage.local.set({ bugReportCache });
      return reportData;
    } catch (error) {
      console.error('BugReporter: Error fetching bug report:', error);

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('无法访问该URL，请检查网络连接');
      } else if (error instanceof SyntaxError) {
        throw new Error('文件不是有效的JSON格式');
      } else {
        throw error;
      }
    }
  }

}

// Initialize background script
new BugReporterBackground();
