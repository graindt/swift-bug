(function () {
  const originalConsole = {
    log: Function.prototype.bind.call(console.log, console),
    error: Function.prototype.bind.call(console.error, console),
    warn: Function.prototype.bind.call(console.warn, console),
    info: Function.prototype.bind.call(console.info, console),
    debug: Function.prototype.bind.call(console.debug, console)
  };

  let _isLogging = false;

  function isDangerousObject(value) {
    const type = Object.prototype.toString.call(value);
    return (
      value === window ||
      value === document ||
      value === console ||
      value instanceof Element ||
      value instanceof Node ||
      value instanceof Window ||
      type === '[object Window]' ||
      type === '[object global]' ||
      type === '[object HTMLDocument]' ||
      type.includes('Vue') ||
      type.includes('Proxy') ||
      type === '[object WeakMap]' ||
      type === '[object WeakSet]' ||
      type === '[object Function]'
    );
  }

  function safeSerialize(obj, depth = 0, depthLimit = 3, seen = new WeakSet()) {
    if (depth > depthLimit) return '[MaxDepth]';

    if (obj === null || typeof obj !== 'object') return obj;
    if (typeof obj === 'function') return '[function]';
    if (typeof obj === 'symbol') return '[symbol]';
    if (typeof obj === 'bigint') return obj.toString() + 'n';
    if (seen.has(obj)) return '[Circular]';
    if (isDangerousObject(obj)) return `[Unserializable:${Object.prototype.toString.call(obj)}]`;

    seen.add(obj);

    // special: handle Error
    if (obj instanceof Error) {
      return {
        name: obj.name,
        message: obj.message,
        stack: obj.stack
      };
    }

    const out = Array.isArray(obj) ? [] : {};
    for (let key in obj) {
      try {
        const val = obj[key];
        out[key] = safeSerialize(val, depth + 1, depthLimit, seen);
      } catch (e) {
        out[key] = `[Error extracting ${key}]`;
      }
    }

    return out;
  }

  function safeStringify(input) {
    try {
      return JSON.stringify(safeSerialize(input), null, 2);
    } catch (e) {
      return '[Unserializable Object]';
    }
  }

  function capture(level, original) {
    return function (...args) {
      if (_isLogging) return;
      _isLogging = true;

      try {
        original(...args);

        const processed = args.map(arg => {
          if (typeof arg === 'string' && arg.startsWith('[Vue warn]')) return arg;
          if (typeof arg === 'object') return safeStringify(arg);
          return String(arg);
        });

        const entry = {
          level,
          timestamp: new Date().toISOString(),
          message: processed.join(' ')
        };

        // Dispatch CustomEvent for extension (avoids flooding DevTools)
        document.dispatchEvent(new CustomEvent('swiftbug-reporter-console', { detail: entry }));
      } catch (e) {
        originalConsole.error('Log capture error:', e);
      } finally {
        _isLogging = false;
      }
    };
  }

  console.log = capture('log', originalConsole.log);
  console.error = capture('error', originalConsole.error);
  console.warn = capture('warn', originalConsole.warn);
  console.info = capture('info', originalConsole.info);
  console.debug = capture('debug', originalConsole.debug);
})();
