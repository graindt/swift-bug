// This script runs in the page context to intercept native console calls
(function() {
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug
  };
  function capture(level, original) {
    return function(...args) {
      original.apply(console, args);
      const entry = {
        level: level,
        timestamp: new Date().toISOString(),
        message: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')
      };
      window.postMessage({ source: 'bug-reporter', logEntry: entry }, '*');
    };
  }
  console.log = capture('log', originalConsole.log);
  console.error = capture('error', originalConsole.error);
  console.warn = capture('warn', originalConsole.warn);
  console.info = capture('info', originalConsole.info);
  console.debug = capture('debug', originalConsole.debug);
})();
