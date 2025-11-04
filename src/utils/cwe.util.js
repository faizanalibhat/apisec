import axios from 'axios';

/**
 * Resolves a CWE ID to its official weakness name using the MITRE CWE API.
 * @param {string} cweId - The Common Weakness Enumeration ID (e.g., 'CWE-89').
 * @returns {Promise<string>} The official name of the weakness, or 'General' if not found or an error occurs.
 */
async function resolveCweToType(cweId) {
  if (!cweId || typeof cweId !== 'string' || !cweId.startsWith('CWE-')) {
    return 'General';
  }

  // Extract the numeric part of the CWE ID
  const id = cweId.split('-')[1];
  if (!id || !/^\d+$/.test(id)) {
      return 'General';
  }

  const url = `https://cwe-api.mitre.org/api/v1/cwe/weakness/${id}`;

  try {
    const response = await axios.get(url);

    // Check if the response has the expected structure
    if (response.data && response.data.Weaknesses && response.data.Weaknesses.length > 0) {
      // The user only wants the name to be mapped
      return response.data.Weaknesses[0].Name || 'General';
    }

    return 'General';
  } catch (error) {
    // The API returns an error for invalid IDs, and axios will throw an exception.
    // This also catches network errors.
    // The user noted the error message is "for weakness: cwe (rgffhf) not found"
    // We will return 'General' for any such error.
    return 'General';
  }
}

export { resolveCweToType };
