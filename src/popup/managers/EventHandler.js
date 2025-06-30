// Event Handler - Manages all popup event listeners
export class EventHandler {
  constructor(popupManager) {
    this.popupManager = popupManager;
  }

  setupEventListeners() {
    // Save button
    document.getElementById('saveBtn').addEventListener('click', () => {
      this.popupManager.saveBugReport();
    });

    // Import button
    document.getElementById('importBtn').addEventListener('click', () => {
      this.popupManager.importBugReport();
    });

    // Delete all button
    document.getElementById('deleteAllBtn').addEventListener('click', () => {
      this.popupManager.deleteAllReports();
    });

    // Settings button
    document.getElementById('settingsBtn').addEventListener('click', () => {
      this.popupManager.openSettings();
    });
  }

  setupReportActionCallback() {
    return (action, reportId) => {
      this.popupManager.handleReportAction(action, reportId);
    };
  }
}
