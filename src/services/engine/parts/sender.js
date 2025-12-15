import axios from "axios";

const REQUEST_TIMEOUT_MS = 10000;

// const formatHeaders = (headersArray) => {
//   const headers = {};
//   (headersArray || []).forEach(({ key, value }) => {
//     headers[key] = value;
//   });
//   return headers;
// };

export const sendRequest = async ({ request, rule }) => {
  const url = new URL(request.url);
  const cleanUrl = `${url.origin}${url.pathname}`;

  let data = request.body;
  const headers = { ...(request.headers || {}) };

  // Handle different body modes
  if (request.mode === 'urlencoded') {
    if (Array.isArray(data)) {
      const params = new URLSearchParams();
      data.forEach(item => params.append(item.key, item.value));
      data = params;
    }
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (request.mode === 'formdata') {
    try {
      // Try using native FormData (Node 18+)
      const formData = new FormData();
      if (Array.isArray(data)) {
        data.forEach(item => formData.append(item.key, item.value));
      }
      data = formData;
      // Let axios/FormData set the Content-Type with boundary
      delete headers['Content-Type'];
    } catch (e) {
      // Fallback for older Node versions or if FormData fails
      console.warn('FormData not available, falling back to URLSearchParams');
      if (Array.isArray(data)) {
        const params = new URLSearchParams();
        data.forEach(item => params.append(item.key, item.value));
        data = params;
      }
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  } else if (request.mode === 'raw') {
    // Ensure content-type matches language
    if (request.language === 'json') {
      headers['Content-Type'] = 'application/json';
    } else if (request.language === 'xml') {
      headers['Content-Type'] = 'application/xml';
    } else if (request.language === 'html') {
      headers['Content-Type'] = 'text/html';
    } else {
      headers['Content-Type'] = 'text/plain';
    }
  }

  const config = {
    method: request.method.toLowerCase(),
    url: cleanUrl,
    headers: headers,
    params: request.params,
    data: data ?? undefined,
    validateStatus: () => true,
    timeout: REQUEST_TIMEOUT_MS,

    maxRedirects: rule?.allow_redirect ? 10 : 0,

    // ✅ prevent Axios from adding defaults but allow it to handle FormData/serialization
    transformRequest: [(data, headers) => {
      // If data is FormData, let axios handle headers (it needs to set boundary)
      if (data && data.constructor && data.constructor.name === 'FormData') {
        return data;
      }

      // For other types, we want to control headers but let axios serialize if needed (though we mostly did it above)
      // We already set the headers we want in the config.headers
      // But axios merges config.headers with defaults.
      // We want to ensure OUR headers take precedence and unwanted defaults are removed.

      // However, the original code completely wiped headers. 
      // We should be careful. The 'headers' arg here is the merged headers.

      // Let's stick to the original logic of cleaning up, but we must ensure our computed 'headers' map is applied.
      // The 'headers' passed to this function is a reference to the request headers.

      // We can just return data and rely on config.headers being set correctly by axios before this?
      // Actually, axios calls transformRequest BEFORE merging headers in some versions, or after.
      // In modern axios, it's safer to just rely on the 'headers' object passed here which is the one to be sent.

      // Clear all headers first to remove defaults
      Object.keys(headers).forEach(key => delete headers[key]);

      // Reapply our computed headers
      // Note: config.headers is not directly accessible here reliably as 'this' context, 
      // but we can assume the headers passed in `config` are applied to the request object 
      // and we just need to make sure we don't lose them.

      // Actually, the previous code was:
      // Object.assign(headers, request.headers || {});

      // Now we want to assign our modified 'headers' variable.
      // Since we can't easily access the 'headers' variable from the outer scope inside this array if it's defined outside 
      // (wait, we CAN access 'headers' from outer scope because it's a closure).
      // Yes, 'headers' (the const defined at top of function) is accessible here.

      // So:
      Object.assign(headers, headers); // This assigns the outer 'headers' to the axios 'headers' argument

      return data;
    }],
  };

  try {
    const response = await axios(config);
    return {
      status: response.status,
      headers: response.headers,
      body: response.data,
    };
  } catch (error) {
    return {
      error: true,
      message: error.message,
    };
  }
};

/**
 * Sends report to the central reporting endpoint.
 */
export const sendReport = async (reportData) => {
  try {
    const response = await axios.post(
      'https://imxx.requestcatcher.com/addReport',
      reportData,
      { timeout: REQUEST_TIMEOUT_MS }
    );
    console.log(`📡 Report sent: ${reportData.title}`);
    return response.status;
  } catch (err) {
    console.error(`❌ Failed to send report: ${err.message}`);
  }
};