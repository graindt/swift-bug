// Bug Data Restoration Module
class BugDataRestorer {
  async restoreBugData(bugData, tab) {
    // Save bugData if id does not exist in storage
    const result = await chrome.storage.local.get(["bugReports"]);
    const bugReports = result.bugReports || {};
    if (!bugData.id || !bugReports[bugData.id]) {
      // Generate id if missing
      const reportId =
        bugData.id ||
        `bug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const bugReport = {
        id: reportId,
        timestamp: bugData.timestamp || new Date().toISOString(),
        title: bugData.title || `Bug Report - ${new URL(bugData.url).hostname}`,
        description: bugData.description || "",
        ...bugData,
      };
      bugReports[reportId] = bugReport;
      await chrome.storage.local.set({ bugReports });
    }

    // Check if hostname or port are different
    const currentUrl = new URL(tab.url);
    const bugUrl = new URL(bugData.url);
    const isCrossDomain =
      currentUrl.hostname !== bugUrl.hostname ||
      currentUrl.port !== bugUrl.port;

    // Navigate to the bug URL
    if (tab.url !== bugData.url) {
      if (isCrossDomain) {
        // Open in new tab if different domain
        const newTab = await chrome.tabs.create({
          url: bugData.url,
          active: true,
        });
        // Wait for navigation to complete
        return new Promise((resolve) => {
          const listener = (tabId, changeInfo) => {
            if (tabId === newTab.id && changeInfo.status === "complete") {
              chrome.tabs.onUpdated.removeListener(listener);
              setTimeout(
                () => this.injectBugData(bugData, newTab.id).then(resolve),
                1000
              );
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
      } else {
        // Navigate in current tab if same domain
        await chrome.tabs.update(tab.id, { url: bugData.url });
        // Wait for navigation to complete
        return new Promise((resolve) => {
          const listener = (tabId, changeInfo) => {
            if (tabId === tab.id && changeInfo.status === "complete") {
              chrome.tabs.onUpdated.removeListener(listener);
              setTimeout(
                () => this.injectBugData(bugData, tab.id).then(resolve),
                1000
              );
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
      }
    } else {
      return this.injectBugData(bugData, tab.id);
    }
  }

  async injectBugData(bugData, tabId) {
    // Use the original report URL origin for setting cookies
    const reportUrl = new URL(bugData.url);
    const reportOrigin = reportUrl.origin;

    // Clear existing data first
    await this._clearExistingData(tabId, bugData.url);

    // Restore cookies
    await this._restoreCookies(bugData, reportOrigin);

    // Inject storage data
    await this._injectStorageData(tabId, bugData);

    // Navigate to the bug URL to apply all changes
    await chrome.tabs.update(tabId, { url: bugData.url });
    console.log(
      "[SwiftBug]: injectBugData: navigated to bug URL for tab",
      tabId
    );
  }

  async _clearExistingData(tabId, url) {
    // Clear existing cookies for the domain first
    try {
      const existingCookies = await chrome.cookies.getAll({ url });
      const reportUrl = new URL(url);
      const reportOrigin = reportUrl.origin;

      for (const cookie of existingCookies) {
        await chrome.cookies.remove({
          url: `${reportOrigin}${cookie.path}`,
          name: cookie.name,
        });
      }
      console.log(
        `BugReporter: Cleared ${existingCookies.length} existing cookies`
      );
    } catch (error) {
      console.error("[SwiftBug]: Error clearing existing cookies:", error);
    }

    // Clear existing storage data first
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Clear localStorage
          try {
            localStorage.clear();
          } catch (error) {
            console.error("Error clearing localStorage:", error);
          }

          // Clear sessionStorage
          try {
            sessionStorage.clear();
          } catch (error) {
            console.error("Error clearing sessionStorage:", error);
          }
        },
      });
      console.log("[SwiftBug]: Cleared existing storage data");
    } catch (error) {
      console.error("[SwiftBug]: Error clearing existing storage data:", error);
    }
  }

  async _restoreCookies(bugData, reportOrigin) {
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
            expirationDate: cookie.expirationDate,
          });
        } catch (error) {
          console.error("[SwiftBug]: Error setting cookie:", error);
        }
      }
      console.log(`BugReporter: Restored ${bugData.cookies.length} cookies`);
    }
  }

  async _injectStorageData(tabId, bugData) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (localStorageData, sessionStorageData) => {
          // Restore localStorage
          Object.entries(localStorageData).forEach(([key, value]) => {
            try {
              localStorage.setItem(key, value);
            } catch (error) {
              console.error("Error setting localStorage item:", error);
            }
          });

          // Restore sessionStorage
          Object.entries(sessionStorageData).forEach(([key, value]) => {
            try {
              sessionStorage.setItem(key, value);
            } catch (error) {
              console.error("Error setting sessionStorage item:", error);
            }
          });
        },
        args: [bugData.localStorage || {}, bugData.sessionStorage || {}],
      });
      console.log(
        "[SwiftBug]: injectBugData: storage data injected for tab",
        tabId
      );
    } catch (error) {
      console.error("[SwiftBug]: Error injecting storage data:", error);
    }
  }

  async restoreBugDataToLocal(bugData, settings) {
    const localhostEndpoint = settings.localhostEndpoint;

    if (!localhostEndpoint) {
      throw new Error("Localhost endpoint is not configured in settings.");
    }

    const localUrl = new URL(localhostEndpoint);
    const localHostname = localUrl.hostname;

    // Create a deep copy of the bug data to avoid modifying the original report
    const localBugData = JSON.parse(JSON.stringify(bugData));

    // Modify cookies for the localhost domain
    if (localBugData.cookies) {
      localBugData.cookies.forEach((cookie) => {
        cookie.domain = localHostname;
        // Remove the 'secure' attribute for http localhost
        if (localUrl.protocol === "http:") {
          delete cookie.secure;
        }
      });
    }

    // Combine localhost endpoint with original path to preserve the specific page
    const originalUrl = new URL(bugData.url);
    const localUrlWithPath = new URL(
      localUrl.origin +
        originalUrl.pathname +
        originalUrl.search +
        originalUrl.hash
    );
    localBugData.url = localUrlWithPath.href;

    // Open a new tab with the localhost URL
    const newTab = await chrome.tabs.create({
      url: localUrlWithPath.href,
      active: true,
    });

    // Wait for the new tab to finish loading before injecting data
    return new Promise((resolve) => {
      const listener = (tabId, changeInfo) => {
        if (tabId === newTab.id && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          // Inject the modified bug data into the new tab
          setTimeout(
            () => this.injectBugData(localBugData, newTab.id).then(resolve),
            1000
          );
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }
}

// Export for use in background script (CommonJS)
if (typeof module !== "undefined" && module.exports) {
  module.exports = BugDataRestorer;
}

// ES6 module export
export default BugDataRestorer;
