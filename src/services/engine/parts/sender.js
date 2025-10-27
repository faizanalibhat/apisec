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

  const config = {
    method: request.method.toLowerCase(),
    url: cleanUrl,
    headers: request.headers || {},        // ✅ only these will be sent
    params: request.params,
    data: request.body ?? undefined,
    validateStatus: () => true,
    timeout: REQUEST_TIMEOUT_MS,

    maxRedirects: rule.allow_redirect ? 10 : 0,

    // ✅ prevent Axios from adding defaults
    transformRequest: [(data, headers) => {
      // Delete all auto-added headers
      Object.keys(headers).forEach(key => delete headers[key]);
      // Reapply only user-provided ones
      Object.assign(headers, request.headers || {});
      return data; // return unmodified data
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