// Bug Report Service - Handles all bug report CRUD operations
export class BugReportService {
  constructor() {
    this.reports = [];
  }

  async loadBugReports() {
    try {
      const response = await this.sendMessage({ action: 'getBugReports' });
      if (response.success) {
        this.reports = response.data;
        return { success: true, data: response.data };
      } else {
        return { success: false, error: response.error };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async saveBugReport() {
    try {
      // Collect page data
      const response = await this.sendMessage({
        action: 'collectPageData'
      });

      if (!response.success) {
        throw new Error(response.error);
      }

      // Save the bug report
      const saveResponse = await this.sendMessage({
        action: 'saveBugReport',
        data: response.data
      });

      if (saveResponse.success) {
        return { success: true };
      } else {
        throw new Error(saveResponse.error);
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async exportReport(reportId) {
    try {
      const response = await this.sendMessage({
        action: 'exportBugReport',
        reportId: reportId
      });

      if (response.success) {
        return { success: true };
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteReport(reportId) {
    try {
      const response = await this.sendMessage({
        action: 'deleteBugReport',
        reportId: reportId
      });

      if (response.success) {
        return { success: true };
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async restoreReport(report) {
    try {
      const response = await this.sendMessage({
        action: 'restoreBugData',
        data: report
      });

      if (response.success) {
        return { success: true };
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getReportById(reportId) {
    return this.reports.find(r => r.id === reportId);
  }

  getReports() {
    return this.reports;
  }

  async sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, resolve);
    });
  }
}
