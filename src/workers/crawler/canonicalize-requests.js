import crypto from 'crypto';

export function canonicalizeRequest(req) {
  const url = new URL(req.url());
  const method = req.method().toUpperCase();
  const headers = req.headers();
  const postData = req.postData();

  // 1. Determine body format and language
  let body = null;
  let body_format = 'raw';
  let language = 'text';

  const contentType = (headers['content-type'] || '').toLowerCase();

  if (postData) {
    if (contentType.includes('application/json')) {
      try {
        body = JSON.parse(postData);
        body_format = 'json';
        language = 'json';
      } catch (e) {
        body = postData;
      }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      body = Object.fromEntries(new URLSearchParams(postData));
      body_format = 'urlencoded';
      language = 'javascript';
    } else if (contentType.includes('text/xml') || contentType.includes('application/xml')) {
      body = postData;
      body_format = 'xml';
      language = 'xml';
    } else if (contentType.includes('text/html')) {
      body = postData;
      body_format = 'html';
      language = 'html';
    } else {
      body = postData;
    }
  }

  // 2. Filter headers (remove sensitive or transient ones)
  const filteredHeaders = filterHeaders(headers);

  // 3. Construct the canonical object matching RawRequest model
  const canonical = {
    method: method,
    url: req.url(),
    headers: filteredHeaders,
    params: Object.fromEntries(url.searchParams),
    body: body,
    body_format: body_format,
    // language: language,
    mode: body_format === 'json' ? 'raw' : body_format,
    rawHttp: generateRawHttp(method, url, headers, postData),
    source: 'crawler',
    collectionName: 'Detected By Crawler',
  };

  // 4. Generate unique signature for deduplication
  // We use method + origin + pathname + sorted query params + body (if exists)
  const sortedParams = Object.keys(canonical.params).sort().map(k => `${k}=${canonical.params[k]}`).join('&');
  const signatureBase = `${method}|${url.origin}${url.pathname}|${sortedParams}|${postData || ''}`;

  canonical.signature = crypto
    .createHash('sha256')
    .update(signatureBase)
    .digest('hex');

  // console.log(`[+] Canonicalized ${method} ${url.pathname} (Format: ${body_format})`);

  return canonical;
}

function filterHeaders(headers) {

  // dont filter headers - let rules do their job.
  return headers;

  const allowed = {};
  const sensitiveHeaders = ['cookie', 'authorization', 'proxy-authorization', 'content-length', 'host'];

  for (const [k, v] of Object.entries(headers)) {
    if (!sensitiveHeaders.includes(k.toLowerCase())) {
      allowed[k] = v;
    }
  }
  return allowed;
}

function generateRawHttp(method, url, headers, body) {
  let raw = `${method} ${url.pathname}${url.search} HTTP/1.1\n`;
  raw += `Host: ${url.host}\n`;

  for (const [k, v] of Object.entries(filterHeaders(headers))) {
    raw += `${k}: ${v}\n`;
  }

  if (body) {
    raw += `\n${body}`;
  }

  return raw;
}

