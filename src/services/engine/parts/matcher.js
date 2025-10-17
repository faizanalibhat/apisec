const buildResponseContent = (response) => {
  const parts = [];
  
  // Include status
  if (response.status) {
    parts.push(response.status.toString());
  }
  
  // Include body
  if (response.body) {
    if (typeof response.body === 'string') {
      parts.push(response.body);
    } else {
      try {
        parts.push(JSON.stringify(response.body));
      } catch {
        parts.push(String(response.body));
      }
    }
  }
  
  // Include headers
  if (response.headers && typeof response.headers === 'object') {
    for (const [key, value] of Object.entries(response.headers)) {
      parts.push(`${key}: ${value}`);
    }
  }
  
  return parts.join('\n');
};

// ============================================================================
// EXPORT SINGLETON INSTANCE
// ============================================================================/**

// ============================================================================
// HANDLER REGISTRY
// ============================================================================

class MatcherRegistry {
  constructor() {
    this.handlers = [];
  }

  register(handler) {
    if (!handler.key || !handler.match || !handler.describe) {
      throw new Error('Handler must have: key, match(), and describe() methods');
    }
    this.handlers.push(handler);
    return this;
  }

  getHandlers() {
    return this.handlers;
  }

  clear() {
    this.handlers = [];
  }
}

// ============================================================================
// BUILT-IN HANDLERS
// ============================================================================

const StatusCodeHandler = {
  key: 'status',
  match({ response, rule }) {
    const expected = rule.status;
    if (typeof expected === 'undefined') return null;
    
    const matched = response.status === expected;
    return {
      matched,
      expected,
      actual: response.status,
    };
  },
  describe(result) {
    return `Response status code equals ${result.expected}`;
  }
};

const BodyContainsHandler = {
  key: 'body_contains',
  match({ response, rule }) {
    const expected = rule.body_contains;
    if (typeof expected === 'undefined') return null;

    const values = Array.isArray(expected) ? expected : [expected];
    let matched = false;
    let matchedValue = null;

    for (const value of values) {
      if (bodyContains(response.body, value)) {
        matched = true;
        matchedValue = value;
        break;
      }
    }

    return {
      matched,
      expected,
      actual: matchedValue,
    };
  },
  describe(result) {
    return `Response body contains "${result.actual}"`;
  }
};

const ResponseSizeHandler = {
  key: 'size',
  match({ response, rule }) {
    const expected = rule.size;
    if (typeof expected === 'undefined') return null;

    let actual = response.size;
    if (typeof actual === 'undefined' && typeof response.body === 'string') {
      actual = Buffer.byteLength(response.body, 'utf8');
    }

    let matched = false;

    if (typeof expected === 'object' && expected !== null) {
      matched = isInRange(actual, expected);
    } else if (typeof expected === 'number') {
      matched = actual === expected;
    }

    return {
      matched,
      expected,
      actual,
    };
  },
  describe(result) {
    if (typeof result.expected === 'object') {
      return `Response size in range [${result.expected.min || '∞'}, ${result.expected.max || '∞'}] bytes`;
    }
    return `Response size equals ${result.expected} bytes`;
  }
};

const HeadersExactMatchHandler = {
  key: 'headers',
  match({ response, rule }) {
    const expected = rule.headers;
    if (typeof expected === 'undefined') return null;

    const headers = normalizeHeaders(response.headers || {});
    const expectedNorm = normalizeHeaderKeys(expected);
    
    const matched = Object.entries(expectedNorm).every(
      ([key, value]) => headers[key] === value
    );

    const matchedHeaders = Object.keys(expectedNorm).filter(
      key => headers[key] === expectedNorm[key]
    );

    return {
      matched,
      expected: expectedNorm,
      actual: matchedHeaders,
    };
  },
  describe(result) {
    return `Headers match: ${JSON.stringify(result.expected)}`;
  }
};

const HeadersExistHandler = {
  key: 'headers_exist',
  match({ response, rule }) {
    const expected = rule.headers_exist;
    if (typeof expected === 'undefined') return null;

    const headers = normalizeHeaders(response.headers || {});
    const expectedHeaders = Array.isArray(expected) ? expected : [expected];
    
    const existing = expectedHeaders.filter(
      header => headers[header.toLowerCase()] !== undefined
    );
    const matched = existing.length === expectedHeaders.length;

    return {
      matched,
      expected: expectedHeaders,
      actual: existing,
    };
  },
  describe(result) {
    return `Headers exist: ${result.expected.join(', ')}`;
  }
};

const HeaderHasValueHandler = {
  key: 'header_has_value',
  match({ response, rule }) {
    const expected = rule.header_has_value;
    if (typeof expected === 'undefined') return null;

    const headers = normalizeHeaders(response.headers || {});
    const checks = Array.isArray(expected) ? expected : [expected];

    let matched = false;
    let matchedCheck = null;

    for (const check of checks) {
      if (headers[check.key.toLowerCase()] === check.value) {
        matched = true;
        matchedCheck = check;
        break;
      }
    }

    return {
      matched,
      expected,
      actual: matchedCheck,
    };
  },
  describe(result) {
    if (!result.actual) return '';
    return `Header ${result.actual.key} equals "${result.actual.value}"`;
  }
};

const ContentTypeHandler = {
  key: 'content_type',
  match({ response, rule }) {
    const expected = rule.content_type;
    if (typeof expected === 'undefined') return null;

    const headers = normalizeHeaders(response.headers || {});
    const actual = headers['content-type'];
    const matched = actual ? actual.includes(expected) : false;

    return {
      matched,
      expected,
      actual,
    };
  },
  describe(result) {
    return `Content-Type contains "${result.expected}"`;
  }
};

const ResponseTimeHandler = {
  key: 'time',
  match({ response, rule }) {
    const expected = rule.time;
    if (typeof expected === 'undefined' || typeof response.time === 'undefined') {
      return null;
    }

    let matched = false;

    if (typeof expected === 'object' && expected !== null) {
      matched = isInRange(response.time, expected);
    } else if (typeof expected === 'number') {
      matched = response.time === expected;
    }

    return {
      matched,
      expected,
      actual: response.time,
    };
  },
  describe(result) {
    if (typeof result.expected === 'object') {
      return `Response time in range [${result.expected.min || '∞'}, ${result.expected.max || '∞'}]ms`;
    }
    return `Response time equals ${result.expected}ms`;
  }
};

const ResponseContainsHandler = {
  key: 'response_contains',
  match({ response, rule }) {
    const expected = rule.response_contains;
    if (typeof expected === 'undefined') return null;

    // Build searchable response string
    const searchContent = buildResponseContent(response);
    
    const values = Array.isArray(expected) ? expected : [expected];
    let matched = false;
    let matchedValue = null;

    for (const value of values) {
      if (searchContent.includes(value)) {
        matched = true;
        matchedValue = value;
        break;
      }
    }

    return {
      matched,
      expected,
      actual: matchedValue,
    };
  },
  describe(result) {
    return `Response contains "${result.actual}"`;
  }
};

// ============================================================================
// MAIN MATCHER FUNCTION
// ============================================================================

export const createMatcher = () => {
  const registry = new MatcherRegistry();

  // Register built-in handlers
  registry.register(StatusCodeHandler);
  registry.register(BodyContainsHandler);
  registry.register(ResponseSizeHandler);
  registry.register(HeadersExactMatchHandler);
  registry.register(HeadersExistHandler);
  registry.register(HeaderHasValueHandler);
  registry.register(ContentTypeHandler);
  registry.register(ResponseTimeHandler);
  registry.register(ResponseContainsHandler);

  return {
    /**
     * Add a custom handler
     * @param {Object} handler - { key, match, describe }
     */
    addHandler(handler) {
      registry.register(handler);
      return this;
    },

    /**
     * Match response against rule
     * @param {Object} response - { status, body, headers, size, time }
     * @param {Object} rule - { status, body_contains, size, headers, ... }
     * @returns {Object} { matched, matchedCriteria, details }
     */
    match(response, rule) {
      const matchRule = rule.match_on || rule.response?.match || rule;
      const handlers = registry.getHandlers();

      const details = {};
      let matchedCriteria = null;

      // Run all handlers and collect results
      for (const handler of handlers) {
        const result = handler.match({ response, rule: matchRule });

        if (result) {
          details[handler.key] = {
            ...result,
            type: handler.key,
          };

          // First match wins
          if (result.matched && !matchedCriteria) {
            matchedCriteria = {
              type: handler.key,
              expected: result.expected,
              actual: result.actual,
              description: handler.describe(result),
            };
          }
        }
      }

      // Overall match: at least one criterion matched
      const matched = Object.values(details).some(d => d.matched === true);

      return {
        matched,
        matchedCriteria,
        details,
      };
    },
  };
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const bodyContains = (body, expected) => {
  if (typeof body === 'string') {
    return body.includes(expected);
  }
  try {
    const stringified = JSON.stringify(body);
    return stringified.includes(expected);
  } catch {
    return false;
  }
};

const normalizeHeaders = (headers) => {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
};

const normalizeHeaderKeys = (headers) => {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
};

const isInRange = (value, range) => {
  const minOk = typeof range.min !== 'number' || value >= range.min;
  const maxOk = typeof range.max !== 'number' || value <= range.max;
  return minOk && maxOk;
};

export const matcher = createMatcher();