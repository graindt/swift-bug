// Utility functions for Swift Bug
class BugReporterUtils {
  // Storage helper methods
  static async getStorageData(keys = null) {
    try {
      return await chrome.storage.local.get(keys);
    } catch (error) {
      console.error('Error getting storage data:', error);
      return {};
    }
  }

  static async setStorageData(data) {
    try {
      await chrome.storage.local.set(data);
      return true;
    } catch (error) {
      console.error('Error setting storage data:', error);
      return false;
    }
  }

  static async clearStorageData() {
    try {
      await chrome.storage.local.clear();
      return true;
    } catch (error) {
      console.error('Error clearing storage data:', error);
      return false;
    }
  }

  // Data validation methods
  static validateBugReport(report) {
    const required = ['id', 'timestamp', 'url', 'title'];
    return required.every(field => report && report[field]);
  }

  static validateSettings(settings) {
    const defaults = {
      maxStoredReports: 50,
      includeScreenshot: true,
      includeNetworkRequests: false,
      maxConsoleLines: 100
    };

    // Ensure all required fields exist
    const validated = { ...defaults, ...settings };

    // Validate ranges
    validated.maxStoredReports = Math.max(10, Math.min(100, validated.maxStoredReports));
    validated.maxConsoleLines = Math.max(50, Math.min(500, validated.maxConsoleLines));

    return validated;
  }

  // Formatting methods
  static formatFileSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  static formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN') + ' ' +
           date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  static formatDomain(url) {
    try {
      return new URL(url).hostname;
    } catch (error) {
      return url;
    }
  }

  // Error handling
  static handleError(error, context = '') {
    const errorMessage = `[Bug Reporter${context ? ' - ' + context : ''}] ${error.message}`;
    console.error(errorMessage, error);
    return errorMessage;
  }

  // Data sanitization
  static sanitizeData(data) {
    // Remove potentially sensitive data
    const sanitized = { ...data };

    // Remove sensitive cookie information
    if (sanitized.cookies) {
      sanitized.cookies = sanitized.cookies.map(cookie => ({
        ...cookie,
        value: cookie.name.toLowerCase().includes('token') ||
               cookie.name.toLowerCase().includes('auth') ||
               cookie.name.toLowerCase().includes('session') ? '[REDACTED]' : cookie.value
      }));
    }

    // Remove sensitive localStorage/sessionStorage
    ['localStorage', 'sessionStorage'].forEach(storageType => {
      if (sanitized[storageType]) {
        Object.keys(sanitized[storageType]).forEach(key => {
          if (key.toLowerCase().includes('token') ||
              key.toLowerCase().includes('auth') ||
              key.toLowerCase().includes('password') ||
              key.toLowerCase().includes('secret')) {
            sanitized[storageType][key] = '[REDACTED]';
          }
        });
      }
    });

    return sanitized;
  }

  // URL validation
  static isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Generate unique ID
  static generateId(prefix = 'bug') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${prefix}_${timestamp}_${random}`;
  }

  // Debounce function for performance
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Deep clone object
  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));
    if (typeof obj === 'object') {
      const clonedObj = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = this.deepClone(obj[key]);
        }
      }
      return clonedObj;
    }
    return obj;
  }

  // Export data to JSON
  static exportToJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }

  // Import data from JSON
  static async importFromJson(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          resolve(data);
        } catch (error) {
          reject(new Error('Invalid JSON file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BugReporterUtils;
} else if (typeof window !== 'undefined') {
  window.BugReporterUtils = BugReporterUtils;
}
