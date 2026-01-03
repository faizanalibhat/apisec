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
  if (request.mode === "urlencoded") {
    if (Array.isArray(data)) {
      const params = new URLSearchParams();
      data.forEach((item) => params.append(item.key, item.value));
      data = params;
    }
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  } else if (request.mode === "formdata") {
    try {
      // Try using native FormData (Node 18+)
      const formData = new FormData();
      if (Array.isArray(data)) {
        data.forEach((item) => formData.append(item.key, item.value));
      }
      data = formData;
      // Let axios/FormData set the Content-Type with boundary
      delete headers["Content-Type"];
    } catch (e) {
      // Fallback for older Node versions or if FormData fails
      console.warn("FormData not available, falling back to URLSearchParams");
      if (Array.isArray(data)) {
        const params = new URLSearchParams();
        data.forEach((item) => params.append(item.key, item.value));
        data = params;
      }
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
  } else if (request.mode === "raw") {
    // Ensure content-type matches language
    if (request.language === "json") {
      headers["Content-Type"] = "application/json";
    } else if (request.language === "xml") {
      headers["Content-Type"] = "application/xml";
    } else if (request.language === "html") {
      headers["Content-Type"] = "text/html";
    } else {
      headers["Content-Type"] = "text/plain";
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
    transformRequest: [
      (data, headers) => {
        // FormData must pass through untouched
        if (data && data.constructor?.name === "FormData") {
          return data;
        }

        // Normalize Content-Type lookup
        const contentType =
          headers["content-type"] || headers["Content-Type"] || "";

        // Explicit serialization (REQUIRED)
        if (data == null) {
          return data;
        }

        if (typeof data === "string" || Buffer.isBuffer(data)) {
          return data;
        }

        if (contentType.includes("application/json")) {
          return JSON.stringify(data);
        }

        if (contentType.includes("application/x-www-form-urlencoded")) {
          return new URLSearchParams(data).toString();
        }

        // Last-resort fallback
        return String(data);
      },
    ],
  };

  try {
    const response = await axios(config);
    return {
      status: response.status,
      headers: response.headers,
      body: response.data,
    };
  } catch (error) {
    console.log(error);
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
      "https://imxx.requestcatcher.com/addReport",
      reportData,
      { timeout: REQUEST_TIMEOUT_MS },
    );
    console.log(`📡 Report sent: ${reportData.title}`);
    return response.status;
  } catch (err) {
    console.error(`❌ Failed to send report: ${err.message}`);
  }
};
