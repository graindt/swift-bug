import StorageManager from '../background/modules/StorageManager.js';

// Options page script for Swift Bug
class BugReporterOptions {
  constructor() {
    this.storageManager = new StorageManager();
    this.settings = {};
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.updateUI();
    this.updateStorageInfo();
  }

  async loadSettings() {
    try {
      this.settings = await this.storageManager.getSettings();
    } catch (error) {
      console.error('[SwiftBug]: Error loading settings:', error);
      this.showError('加载设置失败: ' + error.message);
    }
  }

  setupEventListeners() {
    // Reset button
    document.getElementById('resetBtn').addEventListener('click', () => {
      this.resetSettings();
    });

    // Export all button
    document.getElementById('exportAllBtn').addEventListener('click', () => {
      this.exportAllReports();
    });

    // Clear all button
    document.getElementById('clearAllBtn').addEventListener('click', () => {
      this.clearAllData();
    });

    // Input change listeners for auto-saving
    const inputs = [
      'includeScreenshot',
      'includeNetworkRequests',
      'captureAllNetworkRequests',
      'ignoreStaticResources',
      'maxConsoleLines',
      'maxStoredReports',
      'maxNetworkRequests',
      'maxRequestBodySize',
      'localhostEndpoint'
    ];
    inputs.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('change', () => {
          this.saveSettings();
        });
      }
    });
  }

  updateUI() {
    // Update checkbox states
    document.getElementById('includeScreenshot').checked = this.settings.includeScreenshot;
    document.getElementById('includeNetworkRequests').checked = this.settings.includeNetworkRequests;
    document.getElementById('captureAllNetworkRequests').checked = this.settings.captureAllNetworkRequests || false;
    document.getElementById('ignoreStaticResources').checked = this.settings.ignoreStaticResources !== false;

    // Update number inputs
    document.getElementById('maxConsoleLines').value = this.settings.maxConsoleLines;
    document.getElementById('maxStoredReports').value = this.settings.maxStoredReports;
    document.getElementById('maxNetworkRequests').value = this.settings.maxNetworkRequests || 50;
    document.getElementById('maxRequestBodySize').value = Math.round((this.settings.maxRequestBodySize || 10240) / 1024);
    document.getElementById('localhostEndpoint').value = this.settings.localhostEndpoint || '';
  }

  async updateStorageInfo() {
    try {
      // Get storage usage
      const result = await chrome.storage.local.get(null);
      const dataSize = JSON.stringify(result).length;
      const maxSize = 100 * 1024 * 1024; // 10MB limit for chrome.storage.local

      const usagePercent = (dataSize / maxSize) * 100;
      const usedMB = (dataSize / (1024 * 1024)).toFixed(2);
      const maxMB = (maxSize / (1024 * 1024)).toFixed(0);

      // Update storage bar
      const storageUsedElement = document.getElementById('storageUsed');
      storageUsedElement.style.width = Math.min(usagePercent, 100) + '%';

      // Update storage text
      const storageTextElement = document.getElementById('storageText');
      storageTextElement.textContent = `已使用 ${usedMB}MB / ${maxMB}MB (${usagePercent.toFixed(1)}%)`;

      // Count bug reports
      const bugReports = result.bugReports || {};
      const reportCount = Object.keys(bugReports).length;

      if (reportCount > 0) {
        storageTextElement.textContent += ` • ${reportCount} 个Bug报告`;
      }

    } catch (error) {
      console.error('[SwiftBug]: Error calculating storage usage:', error);
      document.getElementById('storageText').textContent = '无法计算存储使用情况';
    }
  }

  async saveSettings() {
    try {
      // Collect settings from UI
      const newSettings = {
        includeScreenshot: document.getElementById('includeScreenshot').checked,
        includeNetworkRequests: document.getElementById('includeNetworkRequests').checked,
        captureAllNetworkRequests: document.getElementById('captureAllNetworkRequests').checked,
        ignoreStaticResources: document.getElementById('ignoreStaticResources').checked,
        maxConsoleLines: parseInt(document.getElementById('maxConsoleLines').value),
        maxStoredReports: parseInt(document.getElementById('maxStoredReports').value),
        maxNetworkRequests: parseInt(document.getElementById('maxNetworkRequests').value),
        maxRequestBodySize: parseInt(document.getElementById('maxRequestBodySize').value) * 1024, // Convert KB to bytes
        localhostEndpoint: document.getElementById('localhostEndpoint').value.trim()
      };

      // Validate settings
      if (newSettings.maxConsoleLines < 50 || newSettings.maxConsoleLines > 500) {
        throw new Error('控制台日志数量必须在50-500之间');
      }

      if (newSettings.maxStoredReports < 10 || newSettings.maxStoredReports > 100) {
        throw new Error('最大存储Bug数量必须在10-100之间');
      }

      if (newSettings.maxNetworkRequests < 10 || newSettings.maxNetworkRequests > 100) {
        throw new Error('网络请求数量必须在10-100之间');
      }

      if (newSettings.maxRequestBodySize < 1024 || newSettings.maxRequestBodySize > 102400) {
        throw new Error('请求体大小限制必须在1-100KB之间');
      }

      // Save settings using StorageManager
      this.settings = await this.storageManager.updateSettings(newSettings);
      this.showSuccess('设置已自动保存');

    } catch (error) {
      this.showError('保存设置失败: ' + error.message);
    }
  }

  async resetSettings() {
    if (!confirm('确定要重置所有设置为默认值吗？')) {
      return;
    }

    try {
      // Use StorageManager's default settings
      const defaultSettings = this.storageManager.defaultSettings;
      this.settings = await this.storageManager.updateSettings(defaultSettings);
      this.updateUI();
      this.showSuccess('设置已重置为默认值');

    } catch (error) {
      this.showError('重置设置失败: ' + error.message);
    }
  }

  async exportAllReports() {
    const exportBtn = document.getElementById('exportAllBtn');
    const originalText = exportBtn.innerHTML;

    try {
      exportBtn.innerHTML = '<span class="btn-icon">⏳</span>导出中...';
      exportBtn.disabled = true;

      // Get all bug reports
      const result = await chrome.storage.local.get(['bugReports']);
      const bugReports = result.bugReports || {};
      const reports = Object.values(bugReports);

      if (reports.length === 0) {
        this.showError('没有Bug报告可导出');
        return;
      }

      // Create export data
      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        reportCount: reports.length,
        reports: reports
      };

      // Create filename
      const now = new Date();
      const dateStr = now.getFullYear() +
                     String(now.getMonth() + 1).padStart(2, '0') +
                     String(now.getDate()).padStart(2, '0');
      const filename = `swiftbug-reports-all-${dateStr}-${Date.now()}.json`;

      // Download file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();

      URL.revokeObjectURL(url);

      this.showSuccess(`成功导出 ${reports.length} 个Bug报告！`);

    } catch (error) {
      this.showError('导出失败: ' + error.message);
    } finally {
      exportBtn.innerHTML = originalText;
      exportBtn.disabled = false;
    }
  }

  async clearAllData() {
    const confirmMsg = '确定要清除所有数据吗？\n\n这将删除：\n- 所有保存的Bug报告\n- 所有设置\n\n此操作不可恢复！';

    if (!confirm(confirmMsg)) {
      return;
    }

    // Double confirmation
    if (!confirm('请再次确认：真的要删除所有数据吗？')) {
      return;
    }

    const clearBtn = document.getElementById('clearAllBtn');
    const originalText = clearBtn.innerHTML;

    try {
      clearBtn.innerHTML = '<span class="btn-icon">⏳</span>清除中...';
      clearBtn.disabled = true;

      // Save current settings before clearing
      const currentSettings = { ...this.settings };

      // Clear all storage
      await chrome.storage.local.clear();

      // Restore current settings only using StorageManager
      await this.storageManager.updateSettings(currentSettings);
      await chrome.storage.local.set({
        bugReports: {},
        bugReportCache: {}
      });

      this.settings = currentSettings;
      this.updateUI();
      this.updateStorageInfo();
      this.showSuccess('所有数据已清除');

    } catch (error) {
      this.showError('清除数据失败: ' + error.message);
    } finally {
      clearBtn.innerHTML = originalText;
      clearBtn.disabled = false;
    }
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

    // Hide after 4 seconds
    setTimeout(() => {
      statusElement.style.display = 'none';
    }, 4000);
  }
}

// Initialize options page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new BugReporterOptions();
});
