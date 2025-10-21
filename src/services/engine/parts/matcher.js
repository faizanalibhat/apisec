class Matcher {
  constructor() {
    this.operators = new Map();
    this.registerDefaultOperators();
  }

  /**
   * Register a custom operator for extending matcher functionality
   * @param {string} name - Operator name
   * @param {Function} handler - Function that takes (value, target) and returns {matched: boolean, highlight?: string}
   */
  registerOperator(name, handler) {
    this.operators.set(name, handler);
  }

  /**
   * Register default built-in operators
   */
  registerDefaultOperators() {
    // Equality check
    this.registerOperator('equals', (value, target) => ({ matched: target === value }));
    this.registerOperator('exact', (value, target) => ({ matched: target === value }));
    this.registerOperator('not_equals', (value, target) => ({ matched: target !== value }));
    this.registerOperator('strict_equals', (value, target) => ({ matched: target === value }));
    this.registerOperator('type', (value, target) => ({ matched: typeof target === value }));

    // String contains (case-sensitive)
    this.registerOperator('contains', (value, target) => {
      if (typeof target !== 'string') {
        target = String(target);
      }
      const searchValue = (typeof value === 'object' && value !== null) ? value.value : value;
      const isRegex = (typeof value === 'object' && value !== null) ? value.regex || false : false;

      if (isRegex) {
        try {
          const regex = new RegExp(searchValue);
          const match = target.match(regex);
          return { matched: !!match, highlight: match ? match[0] : undefined };
        } catch (e) {
          return { matched: false };
        }
      }
      return { matched: target.includes(searchValue), highlight: target.includes(searchValue) ? searchValue : undefined };
    });

    // String not contains
    this.registerOperator('not_contains', (value, target) => {
      const result = this.operators.get('contains')(value, target);
      return { matched: !result.matched };
    });

    // Case-insensitive contains
    this.registerOperator('contains_i', (value, target) => {
      if (typeof target !== 'string') {
        target = String(target);
      }
      const searchValue = typeof value === 'string' ? value : value.value || '';
      const matched = target.toLowerCase().includes(searchValue.toLowerCase());
      return { matched, highlight: matched ? searchValue : undefined };
    });

    // Regex match
    this.registerOperator('regex', (value, target) => {
      if (typeof target !== 'string') {
        target = String(target);
      }
      try {
        const regex = new RegExp(value);
        const match = target.match(regex);
        return { matched: !!match, highlight: match ? match[0] : undefined };
      } catch (e) {
        return { matched: false };
      }
    });
    // String starts with    
    this.registerOperator('starts_with', (value, target) => ({ matched: String(target).startsWith(value) }));
    // String ends with
    this.registerOperator('ends_with', (value, target) => ({ matched: String(target).endsWith(value) }));
    // Numeric comparison operators
    this.registerOperator('gt', (value, target) => ({ matched: Number(target) > Number(value) }));
    this.registerOperator('gte', (value, target) => ({ matched: Number(target) >= Number(value) }));
    this.registerOperator('lt', (value, target) => ({ matched: Number(target) < Number(value) }));
    this.registerOperator('lte', (value, target) => ({ matched: Number(target) <= Number(value) }));
    // Array operations
    this.registerOperator('in', (value, target) => ({ matched: (Array.isArray(value) ? value : [value]).includes(target) }));
    this.registerOperator('not_in', (value, target) => ({ matched: !(Array.isArray(value) ? value : [value]).includes(target) }));
    this.registerOperator('includes', (value, target) => ({ matched: Array.isArray(target) && target.includes(value) }));
    // Null/undefined checks
    this.registerOperator('exists', (value, target) => ({ matched: (value === true || value === 'true') ? (target !== null && target !== undefined) : (target === null || target === undefined) }));
    // Empty checks
    this.registerOperator('empty', (value, target) => ({ matched: (value === false || value === 'false') ? (target && target.length > 0) : (!target || target.length === 0) }));
    // Length checks
    this.registerOperator('length', (value, target) => ({ matched: (target && target.length) === value }));
    this.registerOperator('length_gte', (value, target) => ({ matched: (target && target.length) >= value }));
    this.registerOperator('length_lte', (value, target) => ({ matched: (target && target.length) <= value }));
    // JSON parsing
    this.registerOperator('json', (value, target) => {
      try {
        const parsed = typeof target === 'string' ? JSON.parse(target) : target;
        if (typeof value === 'object' && value !== null) {
          return this._deepMatch(parsed, value);
        }
        return { matched: !!parsed };
      } catch (e) {
        return { matched: false };
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
    if (!target || target === "all") return true;
    if (!transformedRequest.url) return false;
    
    const requestUrl = new URL(transformedRequest.url);

    if (target.method && !this._matchMethod(target.method, transformedRequest.method)) return false;
    if (target.request_contains && !this._matchRequestContains(target.request_contains, transformedRequest.raw)) return false;
    if (target.header && !this._matchTargetContains(target.header, transformedRequest.headers)) return false;
    if (target.query && !this._matchTargetContains(target.query, requestUrl.search)) return false;
    if (target.path && !this._matchTargetContains(target.path, requestUrl.pathname)) return false;
    if (target.body && !this._matchTargetContains(target.body, transformedRequest.body)) return false;

    return true;
  }

  _matchMethod(targetMethod, requestMethod) {
    if (!requestMethod) return false;
    const methods = Array.isArray(targetMethod) ? targetMethod : [targetMethod];
    return methods.map(m => m.toUpperCase()).includes(requestMethod.toUpperCase());
  }

  _matchRequestContains(targetContains, rawRequest) {
    if (!rawRequest) return false;
    return String(rawRequest).includes(targetContains);
  }

  _matchTargetContains(target, requestPart) {
    if (!target.contains) return true; // No 'contains' condition, so this part matches.
    if (requestPart === undefined || requestPart === null) return false; // Can't find a substring in a null/undefined value.
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

    console.log("[+] USING : ", matchRule);


    if (!matchRule) return { matched: false };

    try {
      // Match status codes
      let statusMatch = { matched: true };

      if (matchRule.status !== undefined) {
        statusMatch = this._matchStatus(matchRule.status, response.status);
        if (!statusMatch.matched) {
          return { matched: false };
        }
      }

      // Match headers
      const headerMatch = matchRule.header ? this._matchHeaders(matchRule.header, response.headers) : { matched: true };
      if (!headerMatch.matched) return { matched: false };

      // Match body
      console.log("[+] MATCHING BODY: ", matchRule.body, response.body);
      const bodyMatch = matchRule.body ? this._matchBody(matchRule.body, response.body) : { matched: true };
      if (!bodyMatch.matched) return { matched: false };

      const highlight = bodyMatch.highlight || headerMatch.highlight || statusMatch.highlight;
      
      return { matched: true, highlight };

    } catch (error) {
      console.error('Matcher error:', error);
      return { matched: false };
    }
  }

  /**
   * Match status codes
   * @private
   */
  _matchStatus(statusRule, actualStatus) {
    let result;
    if (typeof statusRule === 'object' && statusRule !== null && !Array.isArray(statusRule)) {
      result = this._matchWithOperators(statusRule, actualStatus);
    } else {
      const statuses = Array.isArray(statusRule) ? statusRule : [statusRule];
      result = { matched: statuses.includes(actualStatus) };
    }

    if (result.matched) {
      return { matched: true, highlight: String(actualStatus) };
    }
    return { matched: false };
  }

  /**
   * Match headers
   * @private
   */
  _matchHeaders(headerRule, actualHeaders) {
    let highlight;
    for (const [key, value] of Object.entries(headerRule)) {
      if (key === 'contains') {
        const result = this._matchHeadersContains(value, actualHeaders);
        if (!result.matched) return { matched: false };
        highlight = result.highlight;
        continue;
      }

      const headerValue = this._findHeaderValue(key, actualHeaders);
      const result = this._matchWithOperators(value, headerValue);
      if (!result.matched) return { matched: false };
      if (result.highlight) highlight = result.highlight;
    }
    return { matched: true, highlight };
  }

  /**
   * Match header contains operation (searches all headers)
   * @private
   */
  _matchHeadersContains(containsRule, actualHeaders) {
    const searchValue = (typeof containsRule === 'object' && containsRule !== null) ? containsRule.value : containsRule;
    const isRegex = (typeof containsRule === 'object' && containsRule !== null) ? containsRule.regex : false;
    return this._searchHeadersForValue(searchValue, actualHeaders, isRegex);
  }

  /**
   * Search all header values for a match
   * @private
   */
  _searchHeadersForValue(searchValue, headers, isRegex = false) {
    for (const headerValue of Object.values(headers)) {
      const stringValue = String(headerValue);
      if (isRegex) {
        try {
          const regex = new RegExp(searchValue);
          const match = stringValue.match(regex);
          if (match) return { matched: true, highlight: match[0] };
        } catch (e) { /* ignore invalid regex */ }
      } else {
        if (stringValue.includes(searchValue)) return { matched: true, highlight: searchValue };
      }
    }
    return { matched: false };
  }

  /**
   * Find a header value case-insensitively
   * @private
   */
  _findHeaderValue(headerName, headers) {
    const normalizedName = headerName.toLowerCase();
    const foundKey = Object.keys(headers).find(key => key.toLowerCase() === normalizedName);
    return foundKey ? headers[foundKey] : undefined;
  }

  /**
   * Match body
   * @private
   */
  _matchBody(bodyRule, actualBody) {
    let highlight;
    for (const [key, value] of Object.entries(bodyRule)) {
      let result;
      if (key === 'contains') {
        result = this._matchBodyContains(value, actualBody);
      } else if (key === 'json') {
        result = this._matchBodyJson(value, actualBody);
      } else {
      // Deep match in body structure
        result = this._deepMatch(actualBody, { [key]: value });
      }
      
      if (!result.matched) return { matched: false };
      if (result.highlight) highlight = result.highlight;
    }
    return { matched: true, highlight };
  }

  /**
   * Match body contains operation
   * @private
   */
  _matchBodyContains(containsRule, actualBody) {
    const bodyString = typeof actualBody === 'string' ? actualBody : JSON.stringify(actualBody);
    const searchValue = (typeof containsRule === 'object' && containsRule !== null) ? containsRule.value : containsRule;
    const isRegex = (typeof containsRule === 'object' && containsRule !== null) ? containsRule.regex : true;

    console.log("[+] STRING : ", bodyString, searchValue);

    try {
      const regex = new RegExp(searchValue);
      const match = bodyString.match(regex);
      return { matched: !!match, highlight: match ? match[0] : undefined };
    } catch (e) {
      return { matched: false };
    }

    // const matched = bodyString.includes(searchValue);

    // return { matched, highlight: matched ? searchValue : undefined };
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
      return { matched: false };
    }
  }

  /**
   * Match using operators
   * @private
   */
  _matchWithOperators(operatorRule, target) {
    if (typeof operatorRule !== 'object' || operatorRule === null || Array.isArray(operatorRule)) {
        return { matched: operatorRule === target };
    }

    let highlight;
    for (const [operator, value] of Object.entries(operatorRule)) {
      if (!this.operators.has(operator)) {
        throw new Error(`Unknown operator: ${operator}`);
      }
      const handler = this.operators.get(operator);
      const result = handler(value, target);
      if (!result.matched) return { matched: false };
      if (result.highlight) highlight = result.highlight;
    }
    return { matched: true, highlight };
  }

  /**
   * Deep match for nested structures
   * @private
   */
  _deepMatch(actual, expected) {
    let highlight;
    for (const [key, value] of Object.entries(expected)) {
      if (!(key in actual)) return { matched: false };

      let result;
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).some(k => this.operators.has(k))) {
        result = this._matchWithOperators(value, actual[key]);
      } else if (typeof value === 'object' && value !== null) {
        result = this._deepMatch(actual[key], value);
      } else {
        result = { matched: actual[key] === value };
      }
      
      if (!result.matched) return { matched: false };
      if (result.highlight) highlight = result.highlight;
    }
    return { matched: true, highlight };
  }
}

const matcher = new Matcher();

export { matcher };
