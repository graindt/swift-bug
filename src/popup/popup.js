// Main Popup Manager - Orchestrates all popup functionality
import { BugReportService } from './services/BugReportService.js';
import { UIRenderer } from './ui/UIRenderer.js';
import { ModalManager } from './ui/ModalManager.js';
import { FileManager } from './managers/FileManager.js';
import { EventHandler } from './managers/EventHandler.js';
import { getCurrentTab, openSettings, showSuccess, showError } from '../utils/utils.js';

class BugReporterPopup {
  constructor() {
    this.currentTab = null;

    // Initialize modules
    this.bugReportService = new BugReportService();
    this.uiRenderer = new UIRenderer();
    this.modalManager = new ModalManager();
    this.fileManager = new FileManager(this.bugReportService);
    this.eventHandler = new EventHandler(this);

    this.init();
  }

  async init() {
    await this.loadCurrentTab();
    this.setupEventListeners();
    this.updateCurrentPageInfo();
    await this.loadBugReports();
  }

  async loadCurrentTab() {
    this.currentTab = await getCurrentTab();
  }

  setupEventListeners() {
    this.eventHandler.setupEventListeners();
    this.modalManager.setupModalEventListeners();
    this.fileManager.setupFileEventListeners();
  }

  updateCurrentPageInfo() {
    this.uiRenderer.updateCurrentPageInfo(this.currentTab);
  }

  async loadBugReports() {
    try {
      const result = await this.bugReportService.loadBugReports();
      if (result.success) {
        const eventCallback = this.eventHandler.setupReportActionCallback();
        this.uiRenderer.renderBugReports(result.data, eventCallback);
        this.uiRenderer.updateReportCount(result.data.length);
      } else {
        showError('Failed to load bug reports: ' + result.error);
      }
    } catch (error) {
      showError('Error loading bug reports: ' + error.message);
    } finally {
      document.getElementById('loadingReports').style.display = 'none';
    }
  }

  async saveBugReport() {
    const saveBtn = document.getElementById('saveBtn');
    const originalText = saveBtn.innerHTML;

    try {
      // Show loading state
      saveBtn.innerHTML = '<span class="btn-icon">⏳</span>正在保存...';
      saveBtn.disabled = true;

      const result = await this.bugReportService.saveBugReport();

      if (result.success) {
        showSuccess('Bug快照保存成功！');
        await this.loadBugReports(); // Reload reports
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      showError('保存失败: ' + error.message);
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
        case 'restore':
          await this.restoreReport(reportId);
          break;
      }
    } catch (error) {
      showError('操作失败: ' + error.message);
    }
  }

  async viewReport(reportId) {
    const report = this.bugReportService.getReportById(reportId);
    if (!report) {
      showError('报告不存在');
      return;
    }

    this.modalManager.showBugDetailModal(
      report,
      this.uiRenderer.generateBugDetailHTML.bind(this.uiRenderer)
    );
  }

  async exportReport(reportId) {
    const result = await this.bugReportService.exportReport(reportId);

    if (result.success) {
      showSuccess('Bug报告导出成功！');
    } else {
      throw new Error(result.error);
    }
  }

  async deleteReport(reportId) {
    if (!confirm('确定要删除这个Bug报告吗？')) {
      return;
    }

    const result = await this.bugReportService.deleteReport(reportId);

    if (result.success) {
      showSuccess('Bug报告已删除');
      await this.loadBugReports(); // Reload reports

      // If no reports left, clear the reports container and show empty state
      const reports = this.bugReportService.getReports();
      if (reports.length === 0) {
        const container = document.getElementById('reportsContainer');
        const emptyState = document.getElementById('emptyState');
        // Remove all report items
        const existingReports = container.querySelectorAll('.bug-report-item');
        existingReports.forEach(item => item.remove());
        // Show empty state
        emptyState.style.display = 'block';
      }
    } else {
      throw new Error(result.error);
    }
  }

  async restoreReport(reportId) {
    const report = this.bugReportService.getReportById(reportId);
    if (!report) {
      showError('报告不存在');
      return;
    }

    const result = await this.bugReportService.restoreReport(report);

    if (result.success) {
      showSuccess('还原成功！页面已自动跳转并恢复数据。');
    } else {
      throw new Error(result.error);
    }
  }

  importBugReport() {
    this.fileManager.triggerImport();
  }

  openSettings() {
    openSettings();
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new BugReporterPopup();
});
