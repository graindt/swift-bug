// Bug Report Management Module
class BugReportManager {
  constructor() {
    this.defaultSettings = {
      maxStoredReports: 50,
      includeScreenshot: true,
      includeNetworkRequests: true,
      captureAllNetworkRequests: false,
      maxConsoleLines: 100,
      maxNetworkRequests: 50,
      maxRequestBodySize: 10240,
      ignoreStaticResources: true
    };
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
    const settings = result.settings || this.defaultSettings;

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

  async deleteAllBugReports() {
    // Clear all bug reports from storage
    await chrome.storage.local.set({ bugReports: {} });
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
    const filename = `swiftbug-report-${domain}-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${Date.now()}.json`;

    // Download file using data URI (service worker context)
    const jsonStr = JSON.stringify(exportData, null, 2);
    const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr);

    await chrome.downloads.download({ url, filename, saveAs: true });
  }

  async importBugReport(bugData) {
    try {
      console.log('[SwiftBug]: Importing bug report:', bugData.id || 'unnamed');

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
      const settings = result.settings || this.defaultSettings;

      // Check if report already exists
      if (bugReports[reportId]) {
        console.log('[SwiftBug]: Report already exists, updating...');
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

      console.log('[SwiftBug]: Bug report imported successfully:', reportId);
      return { id: reportId, imported: true };

    } catch (error) {
      console.error('[SwiftBug]: Error importing bug report:', error);
      throw error;
    }
  }

  async fetchBugReportFromUrl(url) {
    try {
      // Cache lookup
      const { bugReportCache = {} } = await chrome.storage.local.get(['bugReportCache']);
      if (bugReportCache[url]) {
        console.log('[SwiftBug]: Returning cached bug report for URL:', url);
        return bugReportCache[url].data;
      }
      console.log('[SwiftBug]: Fetching bug report from URL:', url);

       // Fetch the JSON file
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // Try to parse as JSON anyway, in case the server doesn't set correct content-type
        console.warn('[SwiftBug]: Content-Type is not application/json, but attempting to parse as JSON');
      }

      const jsonData = await response.json();
      let reportData;
      // Check if this is an exported bug report format
      if (jsonData.report) {
        console.log('[SwiftBug]: Found exported bug report format');
        reportData = jsonData.report;
      } else if (jsonData.url && jsonData.timestamp) {
        console.log('[SwiftBug]: Found direct bug report format');
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
      console.error('[SwiftBug]: Error fetching bug report:', error);

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

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BugReportManager;
}
