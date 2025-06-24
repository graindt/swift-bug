// UI Renderer - Handles all UI rendering logic
import { escapeHtml, truncateText } from '../../utils/utils.js';

export class UIRenderer {
  constructor() {}

  renderBugReports(reports, eventCallback) {
    const container = document.getElementById('reportsContainer');
    const emptyState = document.getElementById('emptyState');
    const loading = document.getElementById('loadingReports');

    // Hide loading
    loading.style.display = 'none';

    if (reports.length === 0) {
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    // Clear existing reports (keep loading and empty state)
    const existingReports = container.querySelectorAll('.swiftbug-report-item');
    existingReports.forEach(item => item.remove());

    // Render reports
    reports.slice(0, 5).forEach(report => {
      container.appendChild(this.createReportElement(report, eventCallback));
    });
  }

  createReportElement(report, eventCallback) {
    const div = document.createElement('div');
    div.className = 'swiftbug-report-item';

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
      <div class="swiftbug-report-header">
        <div class="swiftbug-report-title">${escapeHtml(report.title)}</div>
        <div class="swiftbug-report-time">${formattedDate}</div>
      </div>
      <div class="swiftbug-report-url">${escapeHtml(domain)}</div>
      <div class="swiftbug-report-actions">
        <button class="btn btn-small btn-view" data-action="view" data-id="${report.id}">查看</button>
        <button class="btn btn-small btn-export" data-action="export" data-id="${report.id}">导出</button>
        <button class="btn btn-small btn-delete" data-action="delete" data-id="${report.id}">删除</button>
        <button class="btn btn-small btn-restore" data-action="restore" data-id="${report.id}">还原</button>
      </div>
    `;

    // Add event listeners
    div.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = button.getAttribute('data-action');
        const reportId = button.getAttribute('data-id');
        if (eventCallback) {
          eventCallback(action, reportId);
        }
      });
    });

    return div;
  }

  updateReportCount(count) {
    const countElement = document.getElementById('reportCount');
    countElement.textContent = `${count}/50`;
  }

  updateCurrentPageInfo(currentTab) {
    const urlElement = document.getElementById('currentUrl');
    if (currentTab && currentTab.url) {
      try {
        const url = new URL(currentTab.url);
        // Include hash in the displayed URL
        urlElement.textContent = url.hostname + url.pathname + url.hash;
        urlElement.title = currentTab.url;
      } catch (error) {
        urlElement.textContent = currentTab.url;
      }
    } else {
      urlElement.textContent = 'Unknown';
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
          <div class="bug-url-value">${escapeHtml(report.url)}</div>
        </div>

        <div class="bug-info-grid">
          <div class="bug-info-item">
            <div class="bug-info-label">页面标题</div>
            <div class="bug-info-value">${escapeHtml(report.title || 'N/A')}</div>
          </div>
          <div class="bug-info-item">
            <div class="bug-info-label">捕获时间</div>
            <div class="bug-info-value">${formattedDate}</div>
          </div>
          <div class="bug-info-item">
            <div class="bug-info-label">域名</div>
            <div class="bug-info-value">${escapeHtml(domain)}</div>
          </div>
          <div class="bug-info-item">
            <div class="bug-info-label">用户代理</div>
            <div class="bug-info-value" title="${escapeHtml(report.userAgent || 'N/A')}">${truncateText(report.userAgent || 'N/A', 50)}</div>
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
                  <div class="storage-key">${escapeHtml(key)}</div>
                  <div class="storage-value">${escapeHtml(truncateText(value, 200))}</div>
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
                  <div class="storage-key">${escapeHtml(key)}</div>
                  <div class="storage-value">${escapeHtml(truncateText(value, 200))}</div>
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
                <div class="storage-key">${escapeHtml(cookie.name)}</div>
                <div class="storage-value" title="Domain: ${escapeHtml(cookie.domain)}, Path: ${escapeHtml(cookie.path)}">${escapeHtml(truncateText(cookie.value, 100))}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Network Requests Section
    if (report.networkRequests && report.networkRequests.length > 0) {
      html += `
        <div class="bug-section">
          <div class="bug-section-title">
            <span class="bug-section-icon">🌐</span>
            网络请求
            <span class="storage-count">${report.networkRequests.length}</span>
          </div>
          <div class="network-requests">
            ${report.networkRequests.map(request => {
              const isError = request.status === 0 || request.status >= 400;
              const statusClass = isError ? 'error' : 'success';
              const method = request.method || 'GET';
              const responseTime = request.responseTime ? `${request.responseTime}ms` : 'N/A';

              return `
                <div class="network-request-item">
                  <div class="network-request-header">
                    <span class="network-method ${method.toLowerCase()}">${method}</span>
                    <span class="network-status ${statusClass}">${request.status || 0}</span>
                    <span class="network-time">${responseTime}</span>
                    <span class="network-type">${request.type}</span>
                  </div>
                  <div class="network-url" title="${escapeHtml(request.url)}">${escapeHtml(truncateText(request.url, 80))}</div>
                  ${request.requestBody ? `
                    <div class="network-body">
                      <div class="network-body-label">请求体:</div>
                      <div class="network-body-content">${escapeHtml(truncateText(request.requestBody, 200))}</div>
                    </div>
                  ` : ''}
                  ${request.responseBody && request.responseBody !== '[Binary or Non-Text Response]' ? `
                    <div class="network-body">
                      <div class="network-body-label">响应体:</div>
                      <div class="network-body-content">${escapeHtml(truncateText(request.responseBody, 200))}</div>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
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
                ${escapeHtml(log.message || log.toString())}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // If no data sections were added, show empty state
    if (!report.screenshot && !hasLocalStorage && !hasSessionStorage &&
        (!report.cookies || report.cookies.length === 0) &&
        (!report.networkRequests || report.networkRequests.length === 0) &&
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
}
