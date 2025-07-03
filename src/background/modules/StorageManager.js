// Storage Management Module
class StorageManager {
  constructor() {
    this.defaultSettings = {
      maxStoredReports: 50,
      includeScreenshot: true,
      includeNetworkRequests: true,
      captureAllNetworkRequests: false, // Only capture failed requests by default
      maxConsoleLines: 100,
      maxNetworkRequests: 50,
      maxRequestBodySize: 10240,
      ignoreStaticResources: true,
      localhostEndpoint: 'http://localhost:8080'
    };
  }

  async initializeStorage() {
    const result = await chrome.storage.local.get(['bugReports', 'settings', 'bugReportCache']);

    if (!result.bugReports) {
      await chrome.storage.local.set({ bugReports: {} });
    }

    if (!result.settings) {
      await chrome.storage.local.set({
        settings: this.defaultSettings
      });
    }
    // Initialize cache for fetched bug reports
    if (!result.bugReportCache) {
      await chrome.storage.local.set({ bugReportCache: {} });
    }
  }

  async getSettings() {
    const result = await chrome.storage.local.get(['settings']);
    return result.settings || this.defaultSettings;
  }

  async updateSettings(newSettings) {
    const currentSettings = await this.getSettings();
    const updatedSettings = { ...currentSettings, ...newSettings };
    await chrome.storage.local.set({ settings: updatedSettings });
    return updatedSettings;
  }

  async clearCache() {
    await chrome.storage.local.set({ bugReportCache: {} });
  }

  async getCacheInfo() {
    const { bugReportCache = {} } = await chrome.storage.local.get(['bugReportCache']);
    const cacheKeys = Object.keys(bugReportCache);
    return {
      size: cacheKeys.length,
      totalSize: JSON.stringify(bugReportCache).length,
      keys: cacheKeys
    };
  }
}

// Export for use in background script (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageManager;
}

// ES6 module export
export default StorageManager;
