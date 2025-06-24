// Options page script for Chrome Bug Reporter
class BugReporterOptions {
  constructor() {
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
      const result = await chrome.storage.local.get(['settings']);
      this.settings = result.settings || {
        maxStoredReports: 50,
        includeScreenshot: true,
        includeNetworkRequests: false,
        maxConsoleLines: 100
      };
    } catch (error) {
      console.error('BugReporter: Error loading settings:', error);
      this.showError('加载设置失败: ' + error.message);
    }
  }

  setupEventListeners() {
    // Save button
    document.getElementById('saveBtn').addEventListener('click', () => {
      this.saveSettings();
    });

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

    // Input change listeners
    const inputs = ['includeScreenshot', 'includeNetworkRequests', 'maxConsoleLines', 'maxStoredReports'];
    inputs.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('change', () => {
          this.markAsModified();
        });
      }
    });
  }

  updateUI() {
    // Update checkbox states
    document.getElementById('includeScreenshot').checked = this.settings.includeScreenshot;
    document.getElementById('includeNetworkRequests').checked = this.settings.includeNetworkRequests;

    // Update number inputs
    document.getElementById('maxConsoleLines').value = this.settings.maxConsoleLines;
    document.getElementById('maxStoredReports').value = this.settings.maxStoredReports;
  }

  async updateStorageInfo() {
    try {
      // Get storage usage
      const result = await chrome.storage.local.get(null);
      const dataSize = JSON.stringify(result).length;
      const maxSize = 10 * 1024 * 1024; // 10MB limit for chrome.storage.local

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
      console.error('BugReporter: Error calculating storage usage:', error);
      document.getElementById('storageText').textContent = '无法计算存储使用情况';
    }
  }

  async saveSettings() {
    const saveBtn = document.getElementById('saveBtn');
    const originalText = saveBtn.textContent;

    try {
      saveBtn.textContent = '保存中...';
      saveBtn.disabled = true;

      // Collect settings from UI
      const newSettings = {
        includeScreenshot: document.getElementById('includeScreenshot').checked,
        includeNetworkRequests: document.getElementById('includeNetworkRequests').checked,
        maxConsoleLines: parseInt(document.getElementById('maxConsoleLines').value),
        maxStoredReports: parseInt(document.getElementById('maxStoredReports').value)
      };

      // Validate settings
      if (newSettings.maxConsoleLines < 50 || newSettings.maxConsoleLines > 500) {
        throw new Error('控制台日志数量必须在50-500之间');
      }

      if (newSettings.maxStoredReports < 10 || newSettings.maxStoredReports > 100) {
        throw new Error('最大存储Bug数量必须在10-100之间');
      }

      // Save settings
      await chrome.storage.local.set({ settings: newSettings });
      this.settings = newSettings;

      this.showSuccess('设置保存成功！');
      this.clearModified();

    } catch (error) {
      this.showError('保存设置失败: ' + error.message);
    } finally {
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    }
  }

  async resetSettings() {
    if (!confirm('确定要重置所有设置为默认值吗？')) {
      return;
    }

    try {
      const defaultSettings = {
        maxStoredReports: 50,
        includeScreenshot: true,
        includeNetworkRequests: false,
        maxConsoleLines: 100
      };

      await chrome.storage.local.set({ settings: defaultSettings });
      this.settings = defaultSettings;
      this.updateUI();
      this.showSuccess('设置已重置为默认值');
      this.clearModified();

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
      const filename = `bug-reports-all-${dateStr}-${Date.now()}.json`;

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

      // Clear all storage
      await chrome.storage.local.clear();

      // Reset to default settings
      const defaultSettings = {
        maxStoredReports: 50,
        includeScreenshot: true,
        includeNetworkRequests: false,
        maxConsoleLines: 100
      };

      await chrome.storage.local.set({
        settings: defaultSettings,
        bugReports: {}
      });

      this.settings = defaultSettings;
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

  markAsModified() {
    const saveBtn = document.getElementById('saveBtn');
    if (!saveBtn.classList.contains('modified')) {
      saveBtn.classList.add('modified');
      saveBtn.textContent = '保存设置 *';
    }
  }

  clearModified() {
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.classList.remove('modified');
    saveBtn.textContent = '保存设置';
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
