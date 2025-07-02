// This script runs in the page context to intercept XMLHttpRequest and fetch calls
(function() {
  // Get settings from global window object (set by content script)
  function getSettings() {
    return window.swiftBugSettings || {
      maxNetworkRequests: 50,
      maxRequestBodySize: 10 * 1024, // 10KB
      captureAllNetworkRequests: false,
      ignoreStaticResources: true
    };
  }

  // Configuration (will be updated from settings)
  let MAX_BODY_SIZE = 10 * 1024; // 10KB
  const IGNORED_EXTENSIONS = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot'];

  // Update configuration from settings
  function updateConfig() {
    const settings = getSettings();
    MAX_BODY_SIZE = settings.maxRequestBodySize || (10 * 1024);
  }

  // Initial config update
  updateConfig();

  // Listen for settings changes
  window.addEventListener('swiftbug-settings-updated', () => {
    updateConfig();
  });

  // Helper function to check if request should be ignored
  function shouldIgnoreRequest(url) {
    const settings = getSettings();
    if (!settings.ignoreStaticResources) {
      return false;
    }

    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();

      // Check if it's a static resource
      return IGNORED_EXTENSIONS.some(ext => pathname.endsWith(ext));
    } catch (error) {
      return false;
    }
  }

  // Helper function to truncate large data
  function truncateData(data, maxSize) {
    if (typeof data === 'string' && data.length > maxSize) {
      return data.substring(0, maxSize) + '[TRUNCATED]';
    }
    return data;
  }

  // Helper function to check if request should be captured (only errors by default)
  function shouldCaptureRequest(requestData) {
    const settings = getSettings();
    const captureAllRequests = settings.captureAllNetworkRequests || false;

    if (captureAllRequests) {
      return true; // Capture all requests if setting is enabled
    }

    // By default, only capture failed requests
    const result = requestData.status === 0 || // Network error
           requestData.status >= 400 || // HTTP error (4xx, 5xx)
           requestData.statusText === 'Network Error';
    // console.log('[SwiftBug][shouldCaptureRequest]', requestData.url, 'status:', requestData.status, 'statusText:', requestData.statusText, '=>', result);
    return result;
  }

  // Helper function to add network request
  function addNetworkRequest(requestData) {
    // Skip if should be ignored
    if (shouldIgnoreRequest(requestData.url)) {
      // console.log('[SwiftBug][addNetworkRequest] Ignored:', requestData.url);
      return;
    }

    // Only capture if it's an error request (by default)
    if (!shouldCaptureRequest(requestData)) {
      // console.log('[SwiftBug][addNetworkRequest] Not captured:', requestData.url, 'status:', requestData.status);
      return;
    }

    // Truncate large bodies
    if (requestData.requestBody) {
      requestData.requestBody = truncateData(requestData.requestBody, MAX_BODY_SIZE);
    }
    if (requestData.responseBody) {
      requestData.responseBody = truncateData(requestData.responseBody, MAX_BODY_SIZE);
    }

    // console.log('[SwiftBug][addNetworkRequest] Captured:', requestData.url, 'status:', requestData.status);
    // Dispatch CustomEvent for extension (network)
    document.dispatchEvent(new CustomEvent('swiftbug-event-network', { detail: requestData }));
  }

  // Intercept XMLHttpRequest
  const originalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new originalXHR();
    const requestData = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      type: 'xhr',
      url: '',
      method: 'GET',
      requestHeaders: {},
      responseHeaders: {},
      requestBody: '',
      responseBody: '',
      status: 0,
      statusText: '',
      startTime: 0,
      endTime: 0,
      responseTime: 0
    };

    // Override open method
    const originalOpen = xhr.open;
    xhr.open = function(method, url, ...args) {
      requestData.method = method.toUpperCase();
      requestData.url = url;
      requestData.startTime = Date.now();
      return originalOpen.apply(this, [method, url, ...args]);
    };

    // Override setRequestHeader
    const originalSetRequestHeader = xhr.setRequestHeader;
    xhr.setRequestHeader = function(name, value) {
      requestData.requestHeaders[name] = value;
      return originalSetRequestHeader.apply(this, arguments);
    };

    // Override send method
    const originalSend = xhr.send;
    xhr.send = function(body) {
      if (body) {
        requestData.requestBody = typeof body === 'string' ? body : String(body);
      }

      // Set up event listeners
      xhr.addEventListener('loadend', function() {
        requestData.endTime = Date.now();
        requestData.responseTime = requestData.endTime - requestData.startTime;
        requestData.status = xhr.status;
        requestData.statusText = xhr.statusText;

        // Get response headers
        const responseHeaders = xhr.getAllResponseHeaders();
        if (responseHeaders) {
          responseHeaders.split('\r\n').forEach(line => {
            const [name, value] = line.split(': ');
            if (name && value) {
              requestData.responseHeaders[name.toLowerCase()] = value;
            }
          });
        }

        // Get response body (if it's text)
        try {
          if (xhr.responseText) {
            requestData.responseBody = xhr.responseText;
          }
        } catch (error) {
          // Response might not be text
          requestData.responseBody = '[Binary or Non-Text Response]';
        }

        addNetworkRequest(requestData);
      });

      return originalSend.apply(this, arguments);
    };

    return xhr;
  };

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = function(resource, options = {}) {
    const startTime = Date.now();
    const url = typeof resource === 'string' ? resource : resource.url;
    const method = options.method || 'GET';

    const requestData = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      type: 'fetch',
      url: url,
      method: method.toUpperCase(),
      requestHeaders: {},
      responseHeaders: {},
      requestBody: '',
      responseBody: '',
      status: 0,
      statusText: '',
      startTime: startTime,
      endTime: 0,
      responseTime: 0
    };

    // Get request headers
    if (options.headers) {
      if (options.headers instanceof Headers) {
        for (const [name, value] of options.headers.entries()) {
          requestData.requestHeaders[name] = value;
        }
      } else if (typeof options.headers === 'object') {
        Object.assign(requestData.requestHeaders, options.headers);
      }
    }

    // Get request body
    if (options.body) {
      if (typeof options.body === 'string') {
        requestData.requestBody = options.body;
      } else {
        requestData.requestBody = '[Non-String Body]';
      }
    }

    return originalFetch.apply(this, arguments).then(response => {
      requestData.endTime = Date.now();
      requestData.responseTime = requestData.endTime - requestData.startTime;
      requestData.status = response.status;
      requestData.statusText = response.statusText;

      // Get response headers
      for (const [name, value] of response.headers.entries()) {
        requestData.responseHeaders[name] = value;
      }

      // Clone response to read body without consuming it
      const responseClone = response.clone();

      // Try to get response body (only for text responses)
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json') ||
          contentType.includes('text/') ||
          contentType.includes('application/xml')) {
        responseClone.text().then(text => {
          requestData.responseBody = text;
          addNetworkRequest(requestData);
        }).catch(() => {
          requestData.responseBody = '[Error Reading Response]';
          addNetworkRequest(requestData);
        });
      } else {
        requestData.responseBody = '[Binary or Non-Text Response]';
        addNetworkRequest(requestData);
      }

      return response;
    }).catch(error => {
      requestData.endTime = Date.now();
      requestData.responseTime = requestData.endTime - requestData.startTime;
      requestData.status = 0;
      requestData.statusText = 'Network Error';
      requestData.responseBody = error.message || 'Network Error';

      addNetworkRequest(requestData);
      throw error;
    });
  };

  // Expose function to get current network requests (for compatibility)
  window.getBugReporterNetworkRequests = function() {
    return window.bugReporterNetworkRequests || [];
  };

  console.log('[SwiftBug]: Network interceptor loaded');
})();
