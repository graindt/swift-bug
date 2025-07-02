// Initialize global settings for page scripts
window.swiftBugSettings = {
  maxConsoleLines: 100,
  maxNetworkRequests: 50,
  maxRequestBodySize: 10 * 1024, // 10KB
  captureAllNetworkRequests: false,
  ignoreStaticResources: true,
  consoleSerializationDepth: 3
};

// Load settings from chrome storage and update global settings
chrome.storage.local.get(['settings'], result => {
  const settings = result.settings || {};

  // Update global settings object
  window.swiftBugSettings = {
    maxConsoleLines: settings.maxConsoleLines || 100,
    maxNetworkRequests: settings.maxNetworkRequests || 50,
    maxRequestBodySize: settings.maxRequestBodySize || (10 * 1024),
    captureAllNetworkRequests: settings.captureAllNetworkRequests || false,
    ignoreStaticResources: settings.ignoreStaticResources !== false,
    consoleSerializationDepth: settings.consoleSerializationDepth || 3
  };
});

// Function to update settings dynamically
function updateSwiftBugSettings(newSettings) {
  // Update global settings
  window.swiftBugSettings = {
    maxConsoleLines: newSettings.maxConsoleLines || 100,
    maxNetworkRequests: newSettings.maxNetworkRequests || 50,
    maxRequestBodySize: newSettings.maxRequestBodySize || (10 * 1024),
    captureAllNetworkRequests: newSettings.captureAllNetworkRequests || false,
    ignoreStaticResources: newSettings.ignoreStaticResources !== false,
    consoleSerializationDepth: newSettings.consoleSerializationDepth || 3
  };

  // Dispatch event to notify injected scripts
  window.dispatchEvent(new CustomEvent('swiftbug-settings-updated', {
    detail: window.swiftBugSettings
  }));
}

// Listen for settings changes from extension
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.settings) {
    updateSwiftBugSettings(changes.settings.newValue || {});
  }
});

// Inject page console interceptor script under CSP
(function injectConsoleInterceptor() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/consoleInterceptor.js');
  script.onload = () => script.remove();
  document.documentElement.appendChild(script);
})();

// Inject network interceptor script with settings
(function injectNetworkInterceptor() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/networkInterceptor.js');
  script.onload = () => script.remove();
  document.documentElement.appendChild(script);
})();

// Listen for forwarded page logs and network requests
window.bugReporterCapturedLogs = [];
window.bugReporterNetworkRequests = [];
window.bugReporterPendingLogs = []; // Buffer for logs received before BugReporterContent is ready

// Listen for CustomEvent from page console interceptor
document.addEventListener('swiftbug-event-console', e => {
  const entry = e.detail;
  // Use the BugReporterContent's addLogEntry method for proper filtering
  if (window.bugReporterContent) {
    window.bugReporterContent.addLogEntry(entry);
  } else {
    // Buffer the log entry if BugReporterContent is not ready yet
    window.bugReporterPendingLogs.push(entry);
  }
});

// Listen for CustomEvent from page network interceptor
document.addEventListener('swiftbug-event-network', e => {
  const req = e.detail;
  window.bugReporterNetworkRequests.push(req);
  if (window.bugReporterNetworkRequests.length > window.swiftBugSettings.maxNetworkRequests) {
    window.bugReporterNetworkRequests = window.bugReporterNetworkRequests.slice(-window.swiftBugSettings.maxNetworkRequests);
  }
});

// Content script for Swift Bug
class BugReporterContent {
  constructor() {
    this.consoleLog = window.bugReporterCapturedLogs || [];
    this.maxLogEntries = window.swiftBugSettings.maxConsoleLines;
    this.setupErrorCapture();
    this.setupMessageListener();
    this.processPendingLogs();
  }

  processPendingLogs() {
    // Process any logs that were received before this instance was created
    if (window.bugReporterPendingLogs && window.bugReporterPendingLogs.length > 0) {
      window.bugReporterPendingLogs.forEach(entry => {
        this.addLogEntry(entry);
      });
      // Clear the pending logs buffer
      window.bugReporterPendingLogs = [];
    }
  }

  setupErrorCapture() {
    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      const logEntry = {
        level: 'error',
        timestamp: new Date().toISOString(),
        message: `Uncaught Error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`
      };

      this.addLogEntry(logEntry);
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const logEntry = {
        level: 'error',
        timestamp: new Date().toISOString(),
        message: `Unhandled Promise Rejection: ${event.reason}`
      };

      this.addLogEntry(logEntry);
    });
  }

  addLogEntry(logEntry) {
    // Filter out logs from this extension
    if (this.isExtensionLog(logEntry.message)) {
      return;
    }

    window.bugReporterCapturedLogs.push(logEntry);

    // Keep only the last N entries
    if (window.bugReporterCapturedLogs.length > this.maxLogEntries) {
      window.bugReporterCapturedLogs = window.bugReporterCapturedLogs.slice(-this.maxLogEntries);
    }

    // Update local reference
    this.consoleLog = window.bugReporterCapturedLogs;
  }

  isExtensionLog(message) {
    // Filter patterns for extension-related logs
    const extensionPatterns = [
      'Bug Reporter',
      'BugReporter',
      '[SwiftBug]',
      'Chrome Bug Reporter',
      'Content Script Loaded',
      'Error accessing localStorage',
      'Error accessing sessionStorage',
      'Error clearing storage',
      'Error setting localStorage item',
      'Error setting sessionStorage item',
      'Storage data restored'
    ];

    return extensionPatterns.some(pattern =>
      message.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  setupMessageListener() {
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'getConsoleLog') {
        // Always use the latest captured logs from global storage
        this.consoleLog = window.bugReporterCapturedLogs || [];
        sendResponse({ consoleLog: this.consoleLog });
      } else if (message.action === 'getNetworkRequests') {
        // Return network requests from global storage
        const networkRequests = window.bugReporterNetworkRequests || [];
        sendResponse({ networkRequests: networkRequests });
      }
      return true;
    });
  }

  // Collect all page data that can be accessed from content script
  collectPageData() {
    const data = {
      localStorage: {},
      sessionStorage: {},
      consoleLog: this.consoleLog,
      pageInfo: {
        url: window.location.href,
        title: document.title,
        referrer: document.referrer,
        timestamp: new Date().toISOString(),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        scrollPosition: {
          x: window.scrollX,
          y: window.scrollY
        }
      }
    };

    // Collect localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        data.localStorage[key] = localStorage.getItem(key);
      }
    } catch (error) {
      console.error('[SwiftBug]: Error accessing localStorage:', error);
    }

    // Collect sessionStorage
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        data.sessionStorage[key] = sessionStorage.getItem(key);
      }
    } catch (error) {
      console.error('[SwiftBug]: Error accessing sessionStorage:', error);
    }

    return data;
  }

  // Restore storage data (used during bug restoration)
  restoreStorageData(localStorageData = {}, sessionStorageData = {}) {
    // Clear existing data
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (error) {
      console.error('[SwiftBug]: Error clearing storage:', error);
    }

    // Restore localStorage
    Object.entries(localStorageData).forEach(([key, value]) => {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        console.error('[SwiftBug]: Error setting localStorage item:', key, error);
      }
    });

    // Restore sessionStorage
    Object.entries(sessionStorageData).forEach(([key, value]) => {
      try {
        sessionStorage.setItem(key, value);
      } catch (error) {
        console.error('[SwiftBug]: Error setting sessionStorage item:', key, error);
      }
    });

    console.log('Swift Bug: Storage data restored');
  }

  // Get current page state for debugging
  getPageState() {
    return {
      url: window.location.href,
      title: document.title,
      readyState: document.readyState,
      timestamp: new Date().toISOString(),
      localStorage: Object.keys(localStorage).length,
      sessionStorage: Object.keys(sessionStorage).length,
      consoleLogCount: this.consoleLog.length
    };
  }
}

// Initialize content script
const bugReporterContent = new BugReporterContent();

// Expose methods to global scope for background script access
window.bugReporterContent = bugReporterContent;

// Add a marker to indicate the content script is loaded
window.bugReporterContentLoaded = true;

// Debug log
console.log('[SwiftBug]: Content Script Loaded', bugReporterContent.getPageState());

// Bug Link Detector - Detects swiftbug-report JSON links and adds view buttons
class BugLinkDetector {
  constructor() {
    this.processedLinks = new Set();
    this.init();
  }

  init() {
    // Inject styles
    this.injectStyles();
    // Scan existing links
    this.scanExistingLinks();
    // Set up mutation observer for dynamic content
    this.setupMutationObserver();
  }

  injectStyles() {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.type = 'text/css';
    style.href = chrome.runtime.getURL('content/inject.css');
    (document.head || document.documentElement).appendChild(style);
  }

  scanExistingLinks() {
    const links = document.querySelectorAll('a');
    links.forEach(link => this.processLink(link));
  }

  setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the node itself is a link
            if (node.tagName === 'A') {
              this.processLink(node);
            }
            // Check for links within the added node
            const links = node.querySelectorAll ? node.querySelectorAll('a') : [];
            links.forEach(link => this.processLink(link));
          }
        });
      });
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  processLink(linkElement) {
    // Check if already processed
    if (this.processedLinks.has(linkElement)) return;

    // Check if link text matches swiftbug-report pattern
    const linkText = linkElement.textContent.trim();
    const swiftbugPattern = /swiftbug-report.*\.json/i;

    if (swiftbugPattern.test(linkText)) {
      this.addViewButton(linkElement);
      this.processedLinks.add(linkElement);
    }
  }

  addViewButton(linkElement) {
    // Create view button (span)
    const viewBtn = document.createElement('span');
    viewBtn.className = 'bug-view-btn';
    viewBtn.textContent = '查看';
    viewBtn.title = '查看Bug详情';
    viewBtn.tabIndex = 0;
    viewBtn.setAttribute('role', 'button');

    // Add click handler
    viewBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleViewClick(linkElement, viewBtn);
    });
    viewBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this.handleViewClick(linkElement, viewBtn);
      }
    });

    // Create import button (span)
    const importBtn = document.createElement('span');
    importBtn.className = 'bug-import-btn';
    importBtn.textContent = '导入';
    importBtn.title = '导入Bug到插件';
    importBtn.tabIndex = 0;
    importBtn.setAttribute('role', 'button');

    // Add import click handler
    importBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleImportClick(linkElement, importBtn);
    });
    importBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this.handleImportClick(linkElement, importBtn);
      }
    });

    // Insert buttons after the link
    linkElement.parentNode.insertBefore(viewBtn, linkElement.nextSibling);
    // Add a space between view and import button
    const space1 = document.createTextNode(' ');
    linkElement.parentNode.insertBefore(space1, viewBtn.nextSibling);
    linkElement.parentNode.insertBefore(importBtn, viewBtn.nextSibling.nextSibling);
    // Add a space between link and view button
    const space2 = document.createTextNode(' ');
    linkElement.parentNode.insertBefore(space2, viewBtn);
  }

  async handleViewClick(linkElement, viewBtn) {
    try {
      // Show loading state
      const originalText = viewBtn.textContent;
      viewBtn.textContent = '加载中...';
      viewBtn.classList.add('disabled');
      viewBtn.setAttribute('aria-disabled', 'true');

      // Fetch and parse the JSON file
      const bugData = await this.fetchBugReport(linkElement.href);

      // Show modal
      const modal = new ContentModalManager();
      modal.showBugDetailModal(bugData);

      // Restore button state
      viewBtn.textContent = originalText;
      viewBtn.classList.remove('disabled');
      viewBtn.setAttribute('aria-disabled', 'false');
    } catch (error) {
      console.error('Error loading bug report:', error);
      alert('加载Bug报告失败：' + error.message);
      // Restore button state
      viewBtn.textContent = '查看';
      viewBtn.classList.remove('disabled');
      viewBtn.setAttribute('aria-disabled', 'false');
    }
  }

  async handleImportClick(linkElement, importBtn) {
    try {
      // Show loading state
      const originalText = importBtn.textContent;
      importBtn.textContent = '导入中...';
      importBtn.classList.add('disabled');
      importBtn.setAttribute('aria-disabled', 'true');

      // Fetch and parse the JSON file
      const bugData = await this.fetchBugReport(linkElement.href);

      // Import the bug report to extension
      const result = await this.importBugReport(bugData);

      if (result.success) {
        // Show success message
        this.showMessage('Bug报告导入成功！', 'success');
        importBtn.textContent = '已导入';
        setTimeout(() => {
          importBtn.textContent = originalText;
          importBtn.classList.remove('disabled');
          importBtn.setAttribute('aria-disabled', 'false');
        }, 2000);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error importing bug report:', error);
      this.showMessage('导入失败：' + error.message, 'error');
      // Restore button state
      importBtn.textContent = '导入';
      importBtn.classList.remove('disabled');
      importBtn.setAttribute('aria-disabled', 'false');
    }
  }

  async importBugReport(bugData) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'importBugReport',
        data: bugData
      }, (response) => {
        if (response && response.success) {
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Failed to import bug report'));
        }
      });
    });
  }

  showMessage(message, type = 'success') {
    // Create or update notification element
    let notification = document.getElementById('swiftbug-notification');
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'swiftbug-notification';
      notification.className = 'swiftbug-notification';
      document.body.appendChild(notification);
    }

    notification.textContent = message;
    notification.className = `swiftbug-notification ${type} show`;

    // Hide after 3 seconds
    setTimeout(() => {
      notification.className = `swiftbug-notification ${type}`;
    }, 3000);
  }

  async fetchBugReport(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'fetchBugReportFromUrl',
        url: url
      }, (response) => {
        if (response && response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Failed to fetch bug report'));
        }
      });
    });
  }
}

// Content Modal Manager - Handles modal display in content script context
class ContentModalManager {
  constructor() {
    this.modal = null;
    this.isEscapeListenerAdded = false;
  }

  showBugDetailModal(bugData) {
    // Remove existing modal if any
    this.closeBugDetailModal();

    // Create modal structure
    this.createModal(bugData);

    // Add event listeners
    this.addEventListeners();

    // Show modal
    this.modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  createModal(bugData) {
    this.modal = document.createElement('div');
    this.modal.className = 'swiftbug-content-modal';
    this.modal.innerHTML = `
      <div class="swiftbug-modal-content">
        <div class="swiftbug-modal-header">
          <h2>Bug详情</h2>
          <button class="swiftbug-modal-close" type="button">&times;</button>
        </div>
        <div class="swiftbug-modal-body">
          ${this.generateBugDetailHTML(bugData)}
        </div>
      </div>
    `;

    document.body.appendChild(this.modal);
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

    // Add other sections similar to UIRenderer.js
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

    // Storage sections
    const hasLocalStorage = report.localStorage && Object.keys(report.localStorage).length > 0;
    const hasSessionStorage = report.sessionStorage && Object.keys(report.sessionStorage).length > 0;

    if (hasLocalStorage || hasSessionStorage) {
      html += `<div class="bug-section"><div class="bug-section-title"><span class="bug-section-icon">💾</span>浏览器存储</div>`;

      if (hasLocalStorage) {
        html += `
          <div class="storage-section">
            <div class="storage-title">📦 LocalStorage <span class="storage-count">${Object.keys(report.localStorage).length}</span></div>
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
            <div class="storage-title">🔒 SessionStorage <span class="storage-count">${Object.keys(report.sessionStorage).length}</span></div>
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

    // Console logs
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

    return html;
  }

  addEventListeners() {
    // Close button
    const closeBtn = this.modal.querySelector('.swiftbug-modal-close');
    closeBtn.addEventListener('click', () => this.closeBugDetailModal());

    // Click outside to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeBugDetailModal();
      }
    });

    // Escape key
    if (!this.isEscapeListenerAdded) {
      document.addEventListener('keydown', this.handleEscapeKey.bind(this));
      this.isEscapeListenerAdded = true;
    }
  }

  handleEscapeKey(event) {
    if (event.key === 'Escape' && this.modal && this.modal.style.display === 'flex') {
      this.closeBugDetailModal();
    }
  }

  closeBugDetailModal() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
      document.body.style.overflow = '';
    }

    if (this.isEscapeListenerAdded) {
      document.removeEventListener('keydown', this.handleEscapeKey.bind(this));
      this.isEscapeListenerAdded = false;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}

// Initialize bug link detector
let bugLinkDetector;

function initBugLinkDetector() {
  if (!bugLinkDetector) {
    bugLinkDetector = new BugLinkDetector();
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBugLinkDetector);
} else {
  initBugLinkDetector();
}

// 注入悬浮保存Bug快照按钮到页面右下角
// (function injectBugFabButton() {
//   if (window.__bugFabInjected) return;
//   window.__bugFabInjected = true;

//   function doInject() {
//     // 注入样式
//     const style = document.createElement('link');
//     style.rel = 'stylesheet';
//     style.type = 'text/css';
//     style.href = chrome.runtime.getURL('content/inject.css');
//     if (document.head) {
//       document.head.appendChild(style);
//     } else {
//       document.documentElement.appendChild(style);
//     }

//     // 创建按钮
//     const fabBtn = document.createElement('button');
//     fabBtn.className = 'bug-fab-save-btn';
//     fabBtn.id = 'bugFabSaveBtn';
//     fabBtn.title = '保存Bug快照';
//     fabBtn.innerHTML = '<span class="btn-icon">📸</span>保存Bug快照';
//     if (document.body) {
//       document.body.appendChild(fabBtn);
//     } else {
//       document.documentElement.appendChild(fabBtn);
//     }

//     // 点击事件：通知background保存快照
//     fabBtn.addEventListener('click', () => {
//       chrome.runtime.sendMessage({ action: 'saveBugSnapshotFromFab' });
//     });
//   }

//   if (document.readyState === 'loading') {
//     document.addEventListener('DOMContentLoaded', doInject);
//   } else {
//     doInject();
//   }
// })();
