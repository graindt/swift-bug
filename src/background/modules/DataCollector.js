// Data Collection Module
class DataCollector {
  async getCurrentActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
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
      console.error('[SwiftBug]: Error retrieving settings:', error);
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
      console.error('[SwiftBug]: Error getting complete URL with hash:', error);
      // Fall back to tab.url if injection fails
    }

    // Collect cookies
    await this._collectCookies(pageData);

    // Collect storage and console data
    await this._collectBrowserData(tab, pageData);

    // Collect viewport info
    await this._collectViewportInfo(tab, pageData);

    // Take screenshot
    await this._takeScreenshot(tab, pageData, settings);

    return pageData;
  }

  async _collectCookies(pageData) {
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
      console.error('[SwiftBug]: Error collecting cookies:', error);
      pageData.cookies = [];
    }
  }

  async _collectBrowserData(tab, pageData) {
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
        console.log('[SwiftBug]: No network requests found, networkData:', networkData);
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
      console.error('[SwiftBug]: Error collecting storage data:', error);
      pageData.localStorage = {};
      pageData.sessionStorage = {};
      pageData.consoleLog = [];
      pageData.networkRequests = [];
    }
  }

  async _collectViewportInfo(tab, pageData) {
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
      console.error('[SwiftBug]: Error collecting viewport info:', error);
      pageData.viewport = {};
    }
  }

  async _takeScreenshot(tab, pageData, settings) {
    if (settings.includeScreenshot) {
      try {
        const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        pageData.screenshot = screenshot;
      } catch (error) {
        console.error('[SwiftBug]: Error taking screenshot:', error);
        pageData.screenshot = null;
      }
    } else {
      pageData.screenshot = null;
    }
  }
}

// Export for use in background script (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataCollector;
}

// ES6 module export
export default DataCollector;
