// Popup script for Chrome Bug Reporter
class BugReporterPopup {
  constructor() {
    this.currentTab = null;
    this.reports = [];
    this.init();
  }

  async init() {
    await this.getCurrentTab();
    this.setupEventListeners();
    this.updateCurrentPageInfo();
    await this.loadBugReports();
  }

  async getCurrentTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    this.currentTab = tabs[0];
  }

  setupEventListeners() {
    // Save button
    document.getElementById('saveBtn').addEventListener('click', () => {
      this.saveBugReport();
    });

    // Import button
    document.getElementById('importBtn').addEventListener('click', () => {
      this.importBugReport();
    });

    // Settings button
    document.getElementById('settingsBtn').addEventListener('click', () => {
      this.openSettings();
    });

    // File input for import
    document.getElementById('fileInput').addEventListener('change', (event) => {
      this.handleFileImport(event);
    });
  }

  updateCurrentPageInfo() {
    const urlElement = document.getElementById('currentUrl');
    if (this.currentTab && this.currentTab.url) {
      try {
        const url = new URL(this.currentTab.url);
        urlElement.textContent = url.hostname + url.pathname;
        urlElement.title = this.currentTab.url;
      } catch (error) {
        urlElement.textContent = this.currentTab.url;
      }
    } else {
      urlElement.textContent = 'Unknown';
    }
  }

  async loadBugReports() {
    try {
      const response = await this.sendMessage({ action: 'getBugReports' });
      if (response.success) {
        this.reports = response.data;
        this.renderBugReports();
        this.updateReportCount();
      } else {
        this.showError('Failed to load bug reports: ' + response.error);
      }
    } catch (error) {
      this.showError('Error loading bug reports: ' + error.message);
    } finally {
      document.getElementById('loadingReports').style.display = 'none';
    }
  }

  renderBugReports() {
    const container = document.getElementById('reportsContainer');
    const emptyState = document.getElementById('emptyState');
    const loading = document.getElementById('loadingReports');

    // Hide loading
    loading.style.display = 'none';

    if (this.reports.length === 0) {
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    // Clear existing reports (keep loading and empty state)
    const existingReports = container.querySelectorAll('.bug-report-item');
    existingReports.forEach(item => item.remove());

    // Render reports
    this.reports.slice(0, 5).forEach(report => {
      container.appendChild(this.createReportElement(report));
    });
  }

  createReportElement(report) {
    const div = document.createElement('div');
    div.className = 'bug-report-item';

    // Format date
    const date = new Date(report.timestamp);
    const formattedDate = date.toLocaleDateString('zh-CN') + ' ' +
                         date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    // Get domain from URL
    let domain = 'Unknown';
    try {
      domain = new URL(report.url).hostname;
    } catch (error) {
      domain = report.url;
    }

    div.innerHTML = `
      <div class="bug-report-header">
        <div class="bug-report-title">${this.escapeHtml(report.title)}</div>
        <div class="bug-report-time">${formattedDate}</div>
      </div>
      <div class="bug-report-url">${this.escapeHtml(domain)}</div>
      <div class="bug-report-actions">
        <button class="btn btn-small btn-view" data-action="view" data-id="${report.id}">查看</button>
        <button class="btn btn-small btn-export" data-action="export" data-id="${report.id}">导出</button>
        <button class="btn btn-small btn-delete" data-action="delete" data-id="${report.id}">删除</button>
      </div>
    `;

    // Add event listeners
    div.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = button.getAttribute('data-action');
        const reportId = button.getAttribute('data-id');
        this.handleReportAction(action, reportId);
      });
    });

    return div;
  }

  updateReportCount() {
    const countElement = document.getElementById('reportCount');
    countElement.textContent = `${this.reports.length}/50`;
  }

  async saveBugReport() {
    const saveBtn = document.getElementById('saveBtn');
    const originalText = saveBtn.innerHTML;

    try {
      // Show loading state
      saveBtn.innerHTML = '<span class="btn-icon">⏳</span>正在保存...';
      saveBtn.disabled = true;

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
        this.showSuccess('Bug快照保存成功！');
        await this.loadBugReports(); // Reload reports
      } else {
        throw new Error(saveResponse.error);
      }

    } catch (error) {
      this.showError('保存失败: ' + error.message);
    } finally {
      // Restore button state
      saveBtn.innerHTML = originalText;
      saveBtn.disabled = false;
    }
  }

  async handleReportAction(action, reportId) {
    try {
      switch (action) {
        case 'view':
          await this.viewReport(reportId);
          break;
        case 'export':
          await this.exportReport(reportId);
          break;
        case 'delete':
          await this.deleteReport(reportId);
          break;
      }
    } catch (error) {
      this.showError('操作失败: ' + error.message);
    }
  }

  async viewReport(reportId) {
    // Find the report
    const report = this.reports.find(r => r.id === reportId);
    if (!report) {
      this.showError('报告不存在');
      return;
    }

    // Display full report data in new tab as JSON
    const dataStr = JSON.stringify(report, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  async exportReport(reportId) {
    try {
      const response = await this.sendMessage({
        action: 'exportBugReport',
        reportId: reportId
      });

      if (response.success) {
        this.showSuccess('Bug报告导出成功！');
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      this.showError('导出失败: ' + error.message);
    }
  }

  async deleteReport(reportId) {
    if (!confirm('确定要删除这个Bug报告吗？')) {
      return;
    }

    try {
      const response = await this.sendMessage({
        action: 'deleteBugReport',
        reportId: reportId
      });

      if (response.success) {
        this.showSuccess('Bug报告已删除');
        await this.loadBugReports(); // Reload reports
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      this.showError('删除失败: ' + error.message);
    }
  }

  importBugReport() {
    document.getElementById('fileInput').click();
  }

  async handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await this.readFileAsText(file);
      const data = JSON.parse(text);

      // Validate file format and support both wrapped and raw report
      let report;
      if (data.report && data.report.url) {
        report = data.report;
      } else if (data.url && data.url && data.id) {
        report = data;
      } else {
        throw new Error('Invalid bug report file format');
      }

      const domain = new URL(report.url).hostname;
      const confirmMsg = `确定要还原Bug现场吗？\n\n页面: ${domain}\n时间: ${new Date(report.timestamp).toLocaleString('zh-CN')}\n\n这将导航到原始页面并还原所有数据。`;

      if (!confirm(confirmMsg)) {
        return;
      }

      // Restore bug data
      const response = await this.sendMessage({
        action: 'restoreBugData',
        data: report
      });

      if (response.success) {
        this.showSuccess('Bug现场还原中...');
        // Close popup after restoration starts
        setTimeout(() => window.close(), 3000);
      } else {
        throw new Error(response.error);
      }

    } catch (error) {
      this.showError('导入失败: ' + error.message);
    } finally {
      // Clear file input
      event.target.value = '';
    }
  }

  openSettings() {
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
  }

  // Utility methods
  async sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, resolve);
    });
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  showSuccess(message) {
    this.showMessage(message, 'success');
  }

  showError(message) {
    this.showMessage(message, 'error');
  }

  showMessage(message, type = 'success') {
    const statusElement = document.getElementById('statusMessage');
    statusElement.textContent = message;
    statusElement.className = `status-message ${type}`;
    statusElement.style.display = 'block';

    // Hide after 3 seconds
    setTimeout(() => {
      statusElement.style.display = 'none';
    }, 3000);
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new BugReporterPopup();
});
