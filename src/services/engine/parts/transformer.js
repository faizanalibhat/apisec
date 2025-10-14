import url from "url";

/**
 * Helper: Convert headers array to object and back
 */
const arrayToHeaderObject = (headersArray) => {
  return headersArray
  // return Object.fromEntries(
  //   (headersArray || []).map(h => [h.key, h.value])
  // );
};

const headerObjectToArray = (headersObj) => {
  return Object.entries(headersObj).map(([key, value]) => ({
    key,
    value,
    type: 'text',
  }));
};

/**
 * Apply transformation rules to a single request.
 * May return multiple transformed requests (for method repetition).
 */
export const transform = ({ request, rule }) => {
  const original = { ...request };

  let baseUrl;

  baseUrl = new URL(original.url);


  // === 1. Handle Header Transformations ===
  // let headers = arrayToHeaderObject(original.headers || []);
  let headers = original.headers;

  // Remove headers
  (rule.transform?.headers?.remove || []).forEach(key => {
    delete headers[key];
  });

  // Replace all header values
  if (rule.transform?.headers?.replace_all_values) {
    Object.keys(headers).forEach(k => headers[k] = rule.transform.headers.replace_all_values);
  }

  // Add headers
  Object.entries(rule.transform?.headers?.add || {}).forEach(([key, value]) => {
    headers[key] = value;
  });

  // === 2. Handle Cookie Transformations ===
  const cookieHeader = headers['Cookie'] || '';
  const cookies = Object.fromEntries(cookieHeader.split(';').map(c => {
    const [k, v] = c.trim().split('=');
    return [k, v];
  }).filter(([k]) => k));

  // Remove cookies
  (rule.transform?.cookies?.remove || []).forEach(k => delete cookies[k]);

  // Add cookies
  Object.entries(rule.transform?.cookies?.add || {}).forEach(([k, v]) => {
    cookies[k] = v;
  });

  // Rebuild Cookie header
  if (Object.keys(cookies).length > 0) {
    headers['Cookie'] = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  } else {
    delete headers['Cookie'];
  }

  // === 3. Override Host ===
  if (rule.transform?.override_host) {
    console.log("[+] OVERRIDEING HOST FROM ", baseUrl.host, " TO ", rule.transform?.override_host);
    baseUrl.host = rule.transform.override_host;
  }

  // === 4. Replace specific param value ===
  const params = baseUrl.searchParams;

  if (rule.transform?.replace_param_value) {
    Object.entries(rule.transform.replace_param_value).forEach(([key, value]) => {
      if (params.has(key)) {
        params.set(key, value);
      }
    });
  }

  // === 5. Replace all param values ===
  if (rule.transform?.replace_all_param_values) {
    for (const key of params.keys()) {
      params.set(key, rule.transform.replace_all_param_values);
    }
  }

  // === 6. Add new query params ===
  Object.entries(rule.transform?.add_query_params || {}).forEach(([key, value]) => {
    params.set(key, value);
  });

  // === Finalize Transformed Base Request ===
  const transformedRequest = {
    ...original,
    method: original.method,
    headers: headerObjectToArray(headers),
    url: baseUrl.toString(),
  };

  // === 7. Repeat request with multiple methods ===
  const methodVariants = rule.transform?.repeat_with_methods || [transformedRequest.method];

  const finalVariants = methodVariants.map(method => ({
    ...transformedRequest,
    method
  }));

  return finalVariants;
};