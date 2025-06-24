# Network Request Capturing Feature

This document describes the network request capturing functionality added to the Swift Bug extension.

## Overview

The extension now captures failed network requests (XHR and Fetch) made by web pages by default, providing detailed information about API errors, failed responses, and potential network-related bugs. This approach significantly reduces memory usage while focusing on the most relevant debugging information.

## Implementation Details

### Files Modified/Added

1. **manifest.json**
   - Added `webRequest` permission
   - Added `networkInterceptor.js` to web accessible resources

2. **src/content/networkInterceptor.js** (NEW)
   - Intercepts XMLHttpRequest and fetch calls in page context
   - Captures request/response data with memory management
   - Filters out static resources by default
   - Limits data size to prevent memory issues

3. **src/content/content.js**
   - Injects network interceptor script
   - Handles network request data from page context
   - Maintains sliding window of network requests (max 50)

4. **src/background/background.js**
   - Collects network request data during bug report creation
   - Updated default settings to enable network request capturing
   - Added logging for debugging

5. **tests/network-test.html** (NEW)
   - Test page for verifying network request capturing
   - Includes XHR, Fetch, and error request examples

### Memory Management Features

- **Request Limit**: Maximum 50 network requests stored (configurable)
- **Body Size Limit**: Request/response bodies limited to 10KB each
- **Static Resource Filtering**: Ignores CSS, JS, images, fonts by default
- **Sliding Window**: Automatically removes oldest requests when limit exceeded

### Captured Data Structure

```javascript
{
  id: "unique_request_id",
  type: "xhr" | "fetch",
  url: "request_url",
  method: "GET|POST|PUT|DELETE|...",
  requestHeaders: {},
  responseHeaders: {},
  requestBody: "request_data",
  responseBody: "response_data",
  status: 200,
  statusText: "OK",
  startTime: timestamp,
  endTime: timestamp,
  responseTime: duration_ms
}
```

### Configuration Options

New settings added to extension:

- `includeNetworkRequests`: Enable/disable network capturing (default: true)
- `captureAllNetworkRequests`: Capture all requests vs only failed requests (default: false)
- `maxNetworkRequests`: Maximum number of requests to store (default: 50)
- `maxRequestBodySize`: Maximum size of request/response bodies (default: 10240 bytes)
- `ignoreStaticResources`: Filter out static assets (default: true)

### Capture Modes

- **Default Mode** (`captureAllNetworkRequests: false`): Only captures failed requests
  - HTTP status codes 400-599 (client/server errors)
  - Network errors (status 0)
  - Requests with "Network Error" status text

- **Full Capture Mode** (`captureAllNetworkRequests: true`): Captures all requests
  - All successful and failed requests
  - Higher memory usage
  - Useful for comprehensive debugging

## Testing

### Using the Test Page

1. Open `tests/network-test.html` in Chrome
2. Ensure the Swift Bug extension is installed
3. Click various request buttons to generate network activity
4. Open the extension popup and create a bug report
5. Export the report and verify network requests are included

### Manual Testing

1. Navigate to any web page with API calls
2. Perform actions that trigger network requests
3. Create a bug report using the extension
4. Check the exported JSON for `networkRequests` array

## Troubleshooting

### Network Requests Not Captured

1. **Check Console**: Look for "BugReporter: Network interceptor loaded" message
2. **Verify Script Injection**: Ensure content script loads successfully
3. **Check Permissions**: Verify `webRequest` permission is granted
4. **Static Resource Filtering**: API requests might be filtered - check URL patterns

### Memory Issues

1. **Reduce Limits**: Lower `maxNetworkRequests` or `maxRequestBodySize`
2. **Enable Filtering**: Ensure `ignoreStaticResources` is enabled
3. **Monitor Usage**: Check browser task manager for extension memory usage

### Debug Logging

Enable debug logging in the browser console:
- Background script logs: Check extension service worker console
- Content script logs: Check page console
- Network capture logs: Look for "BugReporter: Collected X network requests"

## Limitations

1. **Same-Origin Only**: Can only capture requests made by the page's JavaScript
2. **No Navigation Requests**: Document navigation requests not captured
3. **CSP Restrictions**: Some sites may block script injection
4. **Binary Data**: Large binary responses are marked as "[Binary or Non-Text Response]"
5. **Replay Not Supported**: Network requests cannot be replayed during bug restoration

## Future Enhancements

1. **Request Filtering**: User-configurable URL pattern filters
2. **Network Timeline**: Visual timeline of network requests
3. **Response Analysis**: Automatic detection of error responses
4. **Performance Metrics**: Additional timing and performance data
5. **Mock Responses**: Ability to mock responses during bug restoration

## Security Considerations

- Network data may contain sensitive information (auth tokens, personal data)
- Request bodies and responses are stored locally in extension storage
- Users should be cautious when sharing exported bug reports
- Consider implementing data sanitization options for sensitive fields
