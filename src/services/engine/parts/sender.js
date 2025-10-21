import axios from "axios";

const REQUEST_TIMEOUT_MS = 10000;

const formatHeaders = (headersArray) => {
  const headers = {};
  (headersArray || []).forEach(({ key, value }) => {
    headers[key] = value;
  });
  return headers;
};

export const sendRequest = async ({ request }) => {

  const url = new URL(request.url);
  const cleanUrl = `${url.origin}${url.pathname}`;

  const config = {
    method: request.method.toLowerCase(),
    url: cleanUrl,
    params: request.params,
    headers: request.headers,
    data: request.body || undefined,
    validateStatus: () => true,
    timeout: REQUEST_TIMEOUT_MS,
  };


  try {
    const response = await axios(config);
    return {
      status: response.status,
      headers: response.headers,
      body: response.data,
    };
  } catch (error) {
    // console.log("[+] error: ", error.message);
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