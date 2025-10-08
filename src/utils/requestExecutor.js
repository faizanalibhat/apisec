import axios from 'axios';
import https from 'https';
import { ApiError } from './ApiError.js';

class RequestExecutor {
  constructor() {
    // Create axios instance with custom config
    this.client = axios.create({
      timeout: 30000, // 30 second timeout
      maxRedirects: 5,
      validateStatus: () => true, // Don't throw on any status
      httpsAgent: new https.Agent({
        rejectUnauthorized: false // Allow self-signed certificates
      })
    });

    // Bind methods
    this.execute = this.execute.bind(this);
    this.parseHeaders = this.parseHeaders.bind(this);
    this.parseBody = this.parseBody.bind(this);
    this.buildRequestConfig = this.buildRequestConfig.bind(this);
    this.formatResponse = this.formatResponse.bind(this);
  }

  async execute(request) {
    try {
      const config = this.buildRequestConfig(request);
      const startTime = Date.now();
      
      const response = await this.client.request(config);
      const endTime = Date.now();
      
      return this.formatResponse(response, endTime - startTime);
    } catch (error) {
      // Handle network errors, timeouts, etc.
      return this.formatErrorResponse(error);
    }
  }

  buildRequestConfig(request) {
    const config = {
      method: request.method.toLowerCase(),
      url: request.url,
      headers: this.parseHeaders(request.headers),
    };

    // Add body if present
    if (request.body && ['post', 'put', 'patch'].includes(config.method)) {
      config.data = this.parseBody(request.body, config.headers['content-type']);
    }

    // Add query parameters if present
    if (request.params && Object.keys(request.params).length > 0) {
      config.params = request.params;
    }

    return config;
  }

  parseHeaders(headers) {
    if (!headers) return {};
    
    // If headers is already an object, return it
    if (typeof headers === 'object' && !Array.isArray(headers)) {
      return headers;
    }
    
    // If headers is an array of {key, value} objects
    if (Array.isArray(headers)) {
      return headers.reduce((acc, header) => {
        if (header.key && header.value) {
          acc[header.key.toLowerCase()] = header.value;
        }
        return acc;
      }, {});
    }
    
    return {};
  }

  parseBody(body, contentType) {
    if (!body) return undefined;
    
    // If body is already a string, try to parse it based on content type
    if (typeof body === 'string') {
      if (contentType && contentType.includes('application/json')) {
        try {
          return JSON.parse(body);
        } catch {
          return body; // Return as string if parsing fails
        }
      }
      return body;
    }
    
    // If body is an object, return it as is
    return body;
  }

  formatResponse(response, responseTime) {
    return {
      success: true,
      request: {
        method: response.config.method.toUpperCase(),
        url: response.config.url,
        headers: response.config.headers,
        body: response.config.data
      },
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body: response.data,
        responseTime: responseTime,
        size: JSON.stringify(response.data).length
      },
      timestamp: new Date().toISOString()
    };
  }

  formatErrorResponse(error) {
    const errorResponse = {
      success: false,
      request: {
        method: error.config?.method?.toUpperCase() || 'UNKNOWN',
        url: error.config?.url || 'UNKNOWN',
        headers: error.config?.headers || {},
        body: error.config?.data
      },
      response: {
        error: error.message,
        code: error.code,
        status: error.response?.status || 0,
        statusText: error.response?.statusText || 'Network Error',
        headers: error.response?.headers || {},
        body: error.response?.data || null
      },
      timestamp: new Date().toISOString()
    };

    // Add specific error details
    if (error.code === 'ECONNABORTED') {
      errorResponse.response.error = 'Request timeout';
    } else if (error.code === 'ENOTFOUND') {
      errorResponse.response.error = 'DNS lookup failed';
    } else if (error.code === 'ECONNREFUSED') {
      errorResponse.response.error = 'Connection refused';
    }

    return errorResponse;
  }
}

export default new RequestExecutor();