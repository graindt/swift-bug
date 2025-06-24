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

    // Bug detail modal close button
    document.getElementById('closeBugDetail').addEventListener('click', () => {
      this.closeBugDetailModal();
    });

    // Close modal when clicking outside
    document.getElementById('bugDetailModal').addEventListener('click', (event) => {
      if (event.target === document.getElementById('bugDetailModal')) {
        this.closeBugDetailModal();
      }
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

    // Show the bug detail modal
    this.showBugDetailModal(report);
  }

  showBugDetailModal(report) {
    const modal = document.getElementById('bugDetailModal');
    const body = document.getElementById('bugDetailBody');

    // Generate the bug detail HTML
    body.innerHTML = this.generateBugDetailHTML(report);

    // Show the modal
    modal.style.display = 'flex';

    // Add escape key listener
    document.addEventListener('keydown', this.handleEscapeKey.bind(this));
  }

  closeBugDetailModal() {
    const modal = document.getElementById('bugDetailModal');
    modal.style.display = 'none';

    // Remove escape key listener
    document.removeEventListener('keydown', this.handleEscapeKey.bind(this));
  }

  handleEscapeKey(event) {
    if (event.key === 'Escape') {
      this.closeBugDetailModal();
    }
  }

  generateBugDetailHTML(report) {
    const date = new Date(report.timestamp);
    const formattedDate = date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    let domain = 'Unknown';
    try {
      domain = new URL(report.url).hostname;
    } catch (error) {
      domain = report.url;
    }

    let html = `
      <!-- Basic Info Section -->
      <div class="bug-section">
        <div class="bug-section-title">
          <span class="bug-section-icon">📋</span>
          基本信息
        </div>

        <div class="bug-url">
          <div class="bug-url-label">页面地址</div>
          <div class="bug-url-value">${this.escapeHtml(report.url)}</div>
        </div>

        <div class="bug-info-grid">
          <div class="bug-info-item">
            <div class="bug-info-label">页面标题</div>
            <div class="bug-info-value">${this.escapeHtml(report.title || 'N/A')}</div>
          </div>
          <div class="bug-info-item">
            <div class="bug-info-label">捕获时间</div>
            <div class="bug-info-value">${formattedDate}</div>
          </div>
          <div class="bug-info-item">
            <div class="bug-info-label">域名</div>
            <div class="bug-info-value">${this.escapeHtml(domain)}</div>
          </div>
          <div class="bug-info-item">
            <div class="bug-info-label">用户代理</div>
            <div class="bug-info-value" title="${this.escapeHtml(report.userAgent || 'N/A')}">${this.truncateText(report.userAgent || 'N/A', 50)}</div>
          </div>
        </div>
      </div>
    `;

    // Screenshot Section
    if (report.screenshot) {
      html += `
        <div class="bug-section">
          <div class="bug-section-title">
            <span class="bug-section-icon">📸</span>
            页面截图
          </div>
          <div class="bug-screenshot">
            <img src="${report.screenshot}" alt="页面截图" onclick="window.open('${report.screenshot}', '_blank')">
          </div>
        </div>
      `;
    }

    // Storage Section
    const hasLocalStorage = report.localStorage && Object.keys(report.localStorage).length > 0;
    const hasSessionStorage = report.sessionStorage && Object.keys(report.sessionStorage).length > 0;

    if (hasLocalStorage || hasSessionStorage) {
      html += `
        <div class="bug-section">
          <div class="bug-section-title">
            <span class="bug-section-icon">💾</span>
            浏览器存储
          </div>
      `;

      if (hasLocalStorage) {
        html += `
          <div class="storage-section">
            <div class="storage-title">
              📦 LocalStorage
              <span class="storage-count">${Object.keys(report.localStorage).length}</span>
            </div>
            <div class="storage-items">
              ${Object.entries(report.localStorage).map(([key, value]) => `
                <div class="storage-item">
                  <div class="storage-key">${this.escapeHtml(key)}</div>
                  <div class="storage-value">${this.escapeHtml(this.truncateText(value, 200))}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      if (hasSessionStorage) {
        html += `
          <div class="storage-section">
            <div class="storage-title">
              🔒 SessionStorage
              <span class="storage-count">${Object.keys(report.sessionStorage).length}</span>
            </div>
            <div class="storage-items">
              ${Object.entries(report.sessionStorage).map(([key, value]) => `
                <div class="storage-item">
                  <div class="storage-key">${this.escapeHtml(key)}</div>
                  <div class="storage-value">${this.escapeHtml(this.truncateText(value, 200))}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      html += '</div>';
    }

    // Cookies Section
    if (report.cookies && report.cookies.length > 0) {
      html += `
        <div class="bug-section">
          <div class="bug-section-title">
            <span class="bug-section-icon">🍪</span>
            Cookies
            <span class="storage-count">${report.cookies.length}</span>
          </div>
          <div class="storage-items">
            ${report.cookies.map(cookie => `
              <div class="storage-item">
                <div class="storage-key">${this.escapeHtml(cookie.name)}</div>
                <div class="storage-value" title="Domain: ${this.escapeHtml(cookie.domain)}, Path: ${this.escapeHtml(cookie.path)}">${this.escapeHtml(this.truncateText(cookie.value, 100))}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Console Logs Section
    if (report.consoleLog && report.consoleLog.length > 0) {
      html += `
        <div class="bug-section">
          <div class="bug-section-title">
            <span class="bug-section-icon">🖥️</span>
            控制台日志
            <span class="storage-count">${report.consoleLog.length}</span>
          </div>
          <div class="console-logs">
            ${report.consoleLog.map(log => `
              <div class="console-log-item">
                <span class="console-log-level ${log.level || 'log'}">${log.level || 'log'}</span>
                ${this.escapeHtml(log.message || log.toString())}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // If no data sections were added, show empty state
    if (!report.screenshot && !hasLocalStorage && !hasSessionStorage &&
        (!report.cookies || report.cookies.length === 0) &&
        (!report.consoleLog || report.consoleLog.length === 0)) {
      html += `
        <div class="bug-section">
          <div class="empty-data">
            暂无详细数据
          </div>
        </div>
      `;
    }

    return html;
  }

  truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
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
