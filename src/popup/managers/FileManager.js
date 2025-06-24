// File Manager - Handles file import/export operations
export class FileManager {
  constructor(bugReportService) {
    this.bugReportService = bugReportService;
  }

  triggerImport() {
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

      // Restore bug data
      const response = await this.bugReportService.restoreReport(report);

      if (response.success) {
        return { success: true, message: 'Bug现场还原中...' };
      } else {
        throw new Error(response.error);
      }

    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      // Clear file input
      event.target.value = '';
    }
  }

  setupFileEventListeners() {
    // File input for import
    document.getElementById('fileInput').addEventListener('change', async (event) => {
      const result = await this.handleFileImport(event);

      if (result.success) {
        this.showSuccess(result.message);
        // Close popup after restoration starts
        setTimeout(() => window.close(), 3000);
      } else {
        this.showError('导入失败: ' + result.error);
      }
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
