// Message Handler Module
class MessageHandler {
  constructor(bugReportManager, dataCollector, bugDataRestorer, storageManager) {
    this.bugReportManager = bugReportManager;
    this.dataCollector = dataCollector;
    this.bugDataRestorer = bugDataRestorer;
    this.storageManager = storageManager;
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'saveBugReport':
          const result = await this.bugReportManager.saveBugReport(message.data);
          sendResponse({ success: true, data: result });
          break;

        case 'getBugReports':
          const reports = await this.bugReportManager.getBugReports();
          sendResponse({ success: true, data: reports });
          break;

        case 'deleteBugReport':
          await this.bugReportManager.deleteBugReport(message.reportId);
          sendResponse({ success: true });
          break;

        case 'deleteAllBugReports':
          await this.bugReportManager.deleteAllBugReports();
          sendResponse({ success: true });
          break;

        case 'exportBugReport':
          await this.bugReportManager.exportBugReport(message.reportId);
          sendResponse({ success: true });
          break;

        case 'collectPageData':
          // Get current active tab if sender.tab is not available
          const tab = sender.tab || await this.dataCollector.getCurrentActiveTab();
          const pageData = await this.dataCollector.collectPageData(tab);
          sendResponse({ success: true, data: pageData });
          break;

        case 'restoreBugData':
          // Get current active tab if sender.tab is not available
          const restoreTab = sender.tab || await this.dataCollector.getCurrentActiveTab();
          await this.bugDataRestorer.restoreBugData(message.data, restoreTab);
          sendResponse({ success: true });
          break;

        case 'saveBugSnapshotFromFab':
          // 1. 获取当前激活标签页
          const fabTab = sender.tab || await this.dataCollector.getCurrentActiveTab();
          // 2. 收集页面数据
          const fabPageData = await this.dataCollector.collectPageData(fabTab);
          // 3. 保存 bug 报告（无需填写标题/描述）
          await this.bugReportManager.saveBugReport(fabPageData);
          // 4. 可选：通知 content script 显示保存成功提示
          sendResponse({ success: true });
          break;

        case 'fetchBugReportFromUrl':
          try {
            const bugReportData = await this.bugReportManager.fetchBugReportFromUrl(message.url);
            sendResponse({ success: true, data: bugReportData });
          } catch (error) {
            console.error('[SwiftBug]: Error fetching bug report from URL:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'importBugReport':
          try {
            const importResult = await this.bugReportManager.importBugReport(message.data);
            sendResponse({ success: true, data: importResult });
          } catch (error) {
            console.error('[SwiftBug]: Error importing bug report:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'restoreBugDataToLocal':
          const settings = await this.storageManager.getSettings();
          await this.bugDataRestorer.restoreBugDataToLocal(message.data, settings);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('[SwiftBug]: Background script error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
}

// Export for use in background script (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MessageHandler;
}

// ES6 module export
export default MessageHandler;
