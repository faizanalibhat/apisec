class Matcher {
  constructor() {
    this.operators = new Map();
    this.registerDefaultOperators();
  }

  /**
   * Register a custom operator for extending matcher functionality
   * @param {string} name - Operator name
   * @param {Function} handler - Function that takes (value, target) and returns boolean
   */
  registerOperator(name, handler) {
    this.operators.set(name, handler);
  }

  /**
   * Register default built-in operators
   */
  registerDefaultOperators() {
    // Equality check
    this.registerOperator('equals', (value, target) => {
      return target === value;
    });

    // Exact match (alias for equals)
    this.registerOperator('exact', (value, target) => {
      return target === value;
    });

    // Not equal
    this.registerOperator('not_equals', (value, target) => {
      return target !== value;
    });

    // Strict equality
    this.registerOperator('strict_equals', (value, target) => {
      return target === value;
    });

    // Type checking
    this.registerOperator('type', (value, target) => {
      return typeof target === value;
    });

    // String contains (case-sensitive)
    this.registerOperator('contains', (value, target) => {
      if (typeof target !== 'string') {
        target = String(target);
      }
      if (typeof value === 'object' && value !== null) {
        const searchValue = value.value;
        const isRegex = value.regex || false;
        
        if (isRegex) {
          try {
            const regex = new RegExp(searchValue);
            return regex.test(target);
          } catch (e) {
            return false;
          }
        }
        return target.includes(searchValue);
      }
      return target.includes(value);
    });

    // String not contains
    this.registerOperator('not_contains', (value, target) => {
      if (typeof target !== 'string') {
        target = String(target);
      }
      if (typeof value === 'object' && value !== null) {
        const searchValue = value.value;
        const isRegex = value.regex || false;
        
        if (isRegex) {
          try {
            const regex = new RegExp(searchValue);
            return !regex.test(target);
          } catch (e) {
            return true;
          }
        }
        return !target.includes(searchValue);
      }
      return !target.includes(value);
    });

    // Case-insensitive contains
    this.registerOperator('contains_i', (value, target) => {
      if (typeof target !== 'string') {
        target = String(target);
      }
      const searchValue = typeof value === 'string' ? value : value.value || '';
      return target.toLowerCase().includes(searchValue.toLowerCase());
    });

    // Regex match
    this.registerOperator('regex', (value, target) => {
      if (typeof target !== 'string') {
        target = String(target);
      }
      try {
        const regex = new RegExp(value);
        return regex.test(target);
      } catch (e) {
        return false;
      }
    });

    // String starts with
    this.registerOperator('starts_with', (value, target) => {
      if (typeof target !== 'string') {
        target = String(target);
      }
      return target.startsWith(value);
    });

    // String ends with
    this.registerOperator('ends_with', (value, target) => {
      if (typeof target !== 'string') {
        target = String(target);
      }
      return target.endsWith(value);
    });

    // Numeric comparison operators
    this.registerOperator('gt', (value, target) => {
      return Number(target) > Number(value);
    });

    this.registerOperator('gte', (value, target) => {
      return Number(target) >= Number(value);
    });

    this.registerOperator('lt', (value, target) => {
      return Number(target) < Number(value);
    });

    this.registerOperator('lte', (value, target) => {
      return Number(target) <= Number(value);
    });

    // Array operations
    this.registerOperator('in', (value, target) => {
      if (!Array.isArray(value)) {
        value = [value];
      }
      return value.includes(target);
    });

    this.registerOperator('not_in', (value, target) => {
      if (!Array.isArray(value)) {
        value = [value];
      }
      return !value.includes(target);
    });

    // Array contains element
    this.registerOperator('includes', (value, target) => {
      if (!Array.isArray(target)) {
        return false;
      }
      return target.includes(value);
    });

    // Null/undefined checks
    this.registerOperator('exists', (value, target) => {
      if (value === true || value === 'true') {
        return target !== null && target !== undefined;
      }
      return target === null || target === undefined;
    });

    // Empty checks
    this.registerOperator('empty', (value, target) => {
      if (value === false || value === 'false') {
        return target && target.length > 0;
      }
      return !target || target.length === 0;
    });

    // Length checks
    this.registerOperator('length', (value, target) => {
      return (target && target.length) === value;
    });

    this.registerOperator('length_gte', (value, target) => {
      return (target && target.length) >= value;
    });

    this.registerOperator('length_lte', (value, target) => {
      return (target && target.length) <= value;
    });

    // JSON parsing
    this.registerOperator('json', (value, target) => {
      try {
        const parsed = typeof target === 'string' ? JSON.parse(target) : target;
        if (typeof value === 'object' && value !== null) {
          return this._deepMatch(parsed, value);
        }
        return !!parsed;
      } catch (e) {
        return false;
      }
    });
  }

  /**
   * Match the target of a rule against a transformed request
   * @param {Object} rule - The rule object
   * @param {Object} transformedRequest - The transformed request object
   * @returns {boolean} - True if the request matches the target
   */
  matchTarget({ rule, transformedRequest }) {
    const target = rule.target;

    if (!target) {
      return true; // If no target is specified, the rule applies to all requests
    }

    // Ensure we have a valid URL to parse
    if (!transformedRequest.url) {
        return false;
    }
    const requestUrl = new URL(transformedRequest.url);

    if (target == "all") return true;

    if (target.method && !this._matchMethod(target.method, transformedRequest.method)) {
      return false;
    }

    if (target.request_contains && !this._matchRequestContains(target.request_contains, transformedRequest.raw)) {
        return false;
    }

    if (target.header && !this._matchTargetContains(target.header, transformedRequest.headers)) {
        return false;
    }

    if (target.query && !this._matchTargetContains(target.query, requestUrl.search)) {
        return false;
    }

    if (target.path && !this._matchTargetContains(target.path, requestUrl.pathname)) {
        return false;
    }

    if (target.body && !this._matchTargetContains(target.body, transformedRequest.body)) {
        return false;
    }

    return true;
  }

  _matchMethod(targetMethod, requestMethod) {
    if (!requestMethod) return false;
    if (Array.isArray(targetMethod)) {
      return targetMethod.map(m => m.toUpperCase()).includes(requestMethod.toUpperCase());
    }
    return targetMethod.toUpperCase() === requestMethod.toUpperCase();
  }

  _matchRequestContains(targetContains, rawRequest) {
    if (!rawRequest) return false;
    if (typeof rawRequest !== 'string') {
        rawRequest = JSON.stringify(rawRequest);
    }
    return rawRequest.includes(targetContains);
  }

  _matchTargetContains(target, requestPart) {
    if (!target.contains) {
        return true; // No 'contains' condition, so this part matches.
    }
    if (requestPart === undefined || requestPart === null) {
        return false; // Can't find a substring in a null/undefined value.
    }

    const searchIn = typeof requestPart === 'string' ? requestPart : JSON.stringify(requestPart);
    return searchIn.toLowerCase().includes(target.contains.toLowerCase());
  }

  /**
   * Main match function
   * @param {Object} rule - Match rule from YAML
   * @param {Object} response - Response object { status, headers, body }
   * @returns {boolean} - True if response matches the rule
   */
  match({ rule, response }) {

    const matchRule = rule.match_on;

    if (!matchRule) return true;

    try {
      // Match status codes
      if (matchRule.status !== undefined) {
        if (!this._matchStatus(matchRule.status, response.status)) {
          return false;
        }
      }

      // Match headers
      if (matchRule.header !== undefined) {
        if (!this._matchHeaders(matchRule.header, response.headers)) {
          return false;
        }
      }

      // Match body
      if (matchRule.body !== undefined) {
        if (!this._matchBody(matchRule.body, response.body)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Matcher error:', error);
      return false;
    }
  }

  /**
   * Match status codes
   * @private
   */
  _matchStatus(statusRule, actualStatus) {
    if (Array.isArray(statusRule)) {
      return statusRule.includes(actualStatus);
    }
    if (typeof statusRule === 'object' && statusRule !== null) {
      return this._matchWithOperators(statusRule, actualStatus);
    }
    return statusRule === actualStatus;
  }

  /**
   * Match headers
   * @private
   */
  _matchHeaders(headerRule, actualHeaders) {
    for (const [key, value] of Object.entries(headerRule)) {
      if (key === 'contains') {
        if (!this._matchHeadersContains(value, actualHeaders)) {
          return false;
        }
        continue;
      }

      const headerValue = this._findHeaderValue(key, actualHeaders);
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        if (!this._matchWithOperators(value, headerValue)) {
          return false;
        }
      } else {
        if (headerValue !== value) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Match header contains operation (searches all headers)
   * @private
   */
  _matchHeadersContains(containsRule, actualHeaders) {
    if (typeof containsRule === 'string') {
      return this._searchHeadersForValue(containsRule, actualHeaders);
    }

    if (typeof containsRule === 'object' && containsRule !== null) {
      const { value, regex } = containsRule;
      return this._searchHeadersForValue(value, actualHeaders, regex);
    }

    return false;
  }

  /**
   * Search all header values for a match
   * @private
   */
  _searchHeadersForValue(searchValue, headers, isRegex = false) {
    for (const [key, headerValue] of Object.entries(headers)) {
      const stringValue = typeof headerValue === 'string' ? headerValue : String(headerValue);

      if (isRegex) {
        try {
          const regex = new RegExp(searchValue);
          if (regex.test(stringValue)) return true;
        } catch (e) {
          continue;
        }
      } else {
        if (stringValue.includes(searchValue)) return true;
      }
    }
    return false;
  }

  /**
   * Find a header value case-insensitively
   * @private
   */
  _findHeaderValue(headerName, headers) {
    const normalizedName = headerName.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === normalizedName) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * Match body
   * @private
   */
  _matchBody(bodyRule, actualBody) {
    for (const [key, value] of Object.entries(bodyRule)) {
      if (key === 'contains') {
        if (!this._matchBodyContains(value, actualBody)) {
          return false;
        }
        continue;
      }

      if (key === 'json') {
        if (!this._matchBodyJson(value, actualBody)) {
          return false;
        }
        continue;
      }

      // Deep match in body structure
      if (!this._deepMatch(actualBody, { [key]: value })) {
        return false;
      }
    }
    return true;
  }

  /**
   * Match body contains operation
   * @private
   */
  _matchBodyContains(containsRule, actualBody) {
    const bodyString = typeof actualBody === 'string' ? actualBody : JSON.stringify(actualBody);

    if (typeof containsRule === 'string') {
      return bodyString.includes(containsRule);
    }

    if (typeof containsRule === 'object' && containsRule !== null) {
      const { value, regex } = containsRule;
      if (regex) {
        try {
          const regexObj = new RegExp(value);
          return regexObj.test(bodyString);
        } catch (e) {
          return false;
        }
      }
      return bodyString.includes(value);
    }

    return false;
  }

  /**
   * Match body JSON structure
   * @private
   */
  _matchBodyJson(jsonRule, actualBody) {
    try {
      const parsedBody = typeof actualBody === 'string' ? JSON.parse(actualBody) : actualBody;
      return this._deepMatch(parsedBody, jsonRule);
    } catch (e) {
      return false;
    }
  }

  /**
   * Match using operators
   * @private
   */
  _matchWithOperators(operatorRule, target) {
    for (const [operator, value] of Object.entries(operatorRule)) {
      if (!this.operators.has(operator)) {
        throw new Error(`Unknown operator: ${operator}`);
      }

      const handler = this.operators.get(operator);
      if (!handler(value, target)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Deep match for nested structures
   * @private
   */
  _deepMatch(actual, expected) {
    for (const [key, value] of Object.entries(expected)) {
      if (!(key in actual)) {
        return false;
      }

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Nested object - recurse
        if (!this._deepMatch(actual[key], value)) {
          return false;
        }
      } else if (typeof value === 'object' && value !== null && Object.keys(value).length > 0) {
        // Check if it's an operator object
        const keys = Object.keys(value);
        const isOperatorObj = keys.some(k => this.operators.has(k));

        if (isOperatorObj) {
          if (!this._matchWithOperators(value, actual[key])) {
            return false;
          }
        } else {
          // Regular nested object
          if (!this._deepMatch(actual[key], value)) {
            return false;
          }
        }
      } else if (Array.isArray(value)) {
        if (!Array.isArray(actual[key])) {
          return false;
        }
        if (!value.includes(actual[key])) {
          return false;
        }
      } else {
        if (actual[key] !== value) {
          return false;
        }
      }
    }
    return true;
  }
}

const matcher = new Matcher();

export { matcher };