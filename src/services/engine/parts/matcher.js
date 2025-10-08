/**
 * Match the response against the rule and return detailed results
 * @param {Object} response - { status, body, headers, size, time }
 * @param {Object} rule - Parsed rule with match criteria
 * @returns {Object} { matched: boolean, matchedCriteria: Object }
 */
export const matcher = ({ response, rule }) => {
  const match = rule.match_on || rule.response?.match || {};
  const headers = response.headers || {};
  
  // Store all match results
  const matchResults = {
    status: null,
    bodyContains: null,
    size: null,
    headers: null,
    headersExist: null,
    headerHasValue: null,
    contentType: null,
    time: null
  };

  // Store the specific criteria that matched
  let matchedCriteria = null;

  // 1. Status code check
  if (typeof match.status !== 'undefined') {
    const statusMatched = response.status === match.status;
    matchResults.status = {
      matched: statusMatched,
      expected: match.status,
      actual: response.status,
      type: 'status_code'
    };
    
    if (statusMatched && !matchedCriteria) {
      matchedCriteria = {
        type: 'status_code',
        operator: 'equals',
        expected: match.status,
        actual: response.status,
        description: `Response status code equals ${match.status}`
      };
    }
  }

  // 2. Body contains string(s)
  if (typeof match.body_contains !== 'undefined') {
    let bodyMatched = false;
    let matchedValue = null;
    
    if (Array.isArray(match.body_contains)) {
      for (const str of match.body_contains) {
        if (bodyContains(response.body, str)) {
          bodyMatched = true;
          matchedValue = str;
          break;
        }
      }
    } else {
      bodyMatched = bodyContains(response.body, match.body_contains);
      matchedValue = match.body_contains;
    }
    
    matchResults.bodyContains = {
      matched: bodyMatched,
      expected: match.body_contains,
      matchedValue,
      type: 'body_contains'
    };
    
    if (bodyMatched && !matchedCriteria) {
      matchedCriteria = {
        type: 'body_contains',
        operator: 'contains',
        expected: match.body_contains,
        actual: matchedValue,
        description: `Response body contains "${matchedValue}"`
      };
    }
  }

  // 3. Response size
  if (typeof match.size !== 'undefined') {
    let actualSize = response.size;
    if (typeof actualSize === 'undefined' && typeof response.body === 'string') {
      actualSize = Buffer.byteLength(response.body, 'utf8');
    }
    
    let sizeMatched = false;
    let sizeDescription = '';
    
    if (typeof match.size === 'object' && match.size !== null) {
      if (typeof match.size.min === 'number' && actualSize >= match.size.min) {
        sizeMatched = true;
        sizeDescription = `size >= ${match.size.min}`;
      }
      if (typeof match.size.max === 'number' && actualSize <= match.size.max) {
        sizeMatched = sizeMatched && true;
        sizeDescription = sizeDescription ? 'size in range' : `size <= ${match.size.max}`;
      }
    } else if (typeof match.size === 'number') {
      sizeMatched = actualSize === match.size;
      sizeDescription = `size equals ${match.size}`;
    }
    
    matchResults.size = {
      matched: sizeMatched,
      expected: match.size,
      actual: actualSize,
      type: 'response_size'
    };
    
    if (sizeMatched && !matchedCriteria) {
      matchedCriteria = {
        type: 'response_size',
        operator: typeof match.size === 'object' ? 'in_range' : 'equals',
        expected: match.size,
        actual: actualSize,
        description: `Response ${sizeDescription} bytes`
      };
    }
  }

  // 4. Headers exact match
  if (typeof match.headers !== 'undefined') {
    const headersMatched = matchHeaders(headers, match.headers);
    const matchedHeaders = Object.keys(match.headers).filter(key => 
      headers[key.toLowerCase()] === match.headers[key]
    );
    
    matchResults.headers = {
      matched: headersMatched,
      expected: match.headers,
      matchedHeaders,
      type: 'headers_match'
    };
    
    if (headersMatched && !matchedCriteria) {
      matchedCriteria = {
        type: 'headers_match',
        operator: 'equals',
        expected: match.headers,
        actual: matchedHeaders,
        description: `Headers match: ${JSON.stringify(match.headers)}`
      };
    }
  }

  // 5. Headers exist
  if (typeof match.headers_exist !== 'undefined') {
    const expectedHeaders = Array.isArray(match.headers_exist) 
      ? match.headers_exist 
      : [match.headers_exist];
    
    const existingHeaders = expectedHeaders.filter(header => 
      headers[header.toLowerCase()] !== undefined
    );
    const allExist = existingHeaders.length === expectedHeaders.length;
    
    matchResults.headersExist = {
      matched: allExist,
      expected: expectedHeaders,
      existing: existingHeaders,
      type: 'headers_exist'
    };
    
    if (allExist && !matchedCriteria) {
      matchedCriteria = {
        type: 'headers_exist',
        operator: 'exists',
        expected: expectedHeaders,
        actual: existingHeaders,
        description: `Headers exist: ${expectedHeaders.join(', ')}`
      };
    }
  }

  // 6. Header has value
  if (typeof match.header_has_value !== 'undefined') {
    let headerValueMatched = false;
    let matchedHeader = null;
    
    const checks = Array.isArray(match.header_has_value) 
      ? match.header_has_value 
      : [match.header_has_value];
    
    for (const check of checks) {
      if (headerHasValue(headers, check.key, check.value)) {
        headerValueMatched = true;
        matchedHeader = check;
        break;
      }
    }
    
    matchResults.headerHasValue = {
      matched: headerValueMatched,
      expected: match.header_has_value,
      matchedHeader,
      type: 'header_value'
    };
    
    if (headerValueMatched && !matchedCriteria) {
      matchedCriteria = {
        type: 'header_value',
        operator: 'equals',
        expected: matchedHeader,
        actual: headers[matchedHeader.key.toLowerCase()],
        description: `Header ${matchedHeader.key} equals "${matchedHeader.value}"`
      };
    }
  }

  // 7. Content-Type
  if (typeof match.content_type !== 'undefined') {
    const contentTypeMatched = contentTypeMatches(headers, match.content_type);
    const actualContentType = headers['content-type'] || headers['Content-Type'];
    
    matchResults.contentType = {
      matched: contentTypeMatched,
      expected: match.content_type,
      actual: actualContentType,
      type: 'content_type'
    };
    
    if (contentTypeMatched && !matchedCriteria) {
      matchedCriteria = {
        type: 'content_type',
        operator: 'contains',
        expected: match.content_type,
        actual: actualContentType,
        description: `Content-Type contains "${match.content_type}"`
      };
    }
  }

  // 8. Response time
  if (typeof match.time !== 'undefined' && typeof response.time !== 'undefined') {
    let timeMatched = false;
    let timeDescription = '';
    
    if (typeof match.time === 'object' && match.time !== null) {
      if (typeof match.time.min === 'number' && response.time >= match.time.min) {
        timeMatched = true;
        timeDescription = `time >= ${match.time.min}ms`;
      }
      if (typeof match.time.max === 'number' && response.time <= match.time.max) {
        timeMatched = timeMatched && true;
        timeDescription = timeDescription ? 'time in range' : `time <= ${match.time.max}ms`;
      }
    } else if (typeof match.time === 'number') {
      timeMatched = response.time === match.time;
      timeDescription = `time equals ${match.time}ms`;
    }
    
    matchResults.time = {
      matched: timeMatched,
      expected: match.time,
      actual: response.time,
      type: 'response_time'
    };
    
    if (timeMatched && !matchedCriteria) {
      matchedCriteria = {
        type: 'response_time',
        operator: typeof match.time === 'object' ? 'in_range' : 'equals',
        expected: match.time,
        actual: response.time,
        description: `Response ${timeDescription}`
      };
    }
  }

  // Determine overall match
  const matched = Object.values(matchResults)
    .filter(result => result !== null)
    .some(result => result.matched === true);

  return {
    matched,
    matchedCriteria: matchedCriteria || null,
    details: matchResults
  };
};

// Helper functions
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

const matchHeaders = (actualHeaders, expectedHeaders) => {
  for (const [key, expectedValue] of Object.entries(expectedHeaders)) {
    const actualValue = actualHeaders[key.toLowerCase()];
    if (!actualValue || actualValue !== expectedValue) {
      return false;
    }
  }
  return true;
};

const headersExist = (actualHeaders, expectedHeaderKeys) => {
  for (const key of expectedHeaderKeys) {
    if (!(key.toLowerCase() in actualHeaders)) {
      return false;
    }
  }
  return true;
};

const headerHasValue = (actualHeaders, key, expectedValue) => {
  const actualValue = actualHeaders[key.toLowerCase()];
  return actualValue === expectedValue;
};

const contentTypeMatches = (actualHeaders, expectedType) => {
  const ct = actualHeaders['content-type'] || actualHeaders['Content-Type'];
  if (!ct) return false;
  return ct.includes(expectedType);
};