import _ from 'lodash';
import bodyTransformer from './http/body.transformer.js';
import headersTransformer from './http/header.transformer.js';
import queryTransformer from './http/query.transformer.js';
import pathTransformer from './http/path.transformer.js';
import { query } from 'express-validator';


export const transformer = {
  transform({ request, rule, authProfile }) {
    const transformRules = rule.transform;

    if (!transformRules) return [];

    let requests = [_.cloneDeep(request)];

    if (transformRules.http_version) {
      requests = requests.map(req => {
        req.version = transformRules.http_version;
        return req;
      });
    }

    if (transformRules.override_host) {
      try {
          requests = requests.map(req => {
            let url = new URL(req.url);
            url.host = transformRules.override_host;
            req.url = url.toString();
            return req;
          });
      }
      catch(err) {
        console.log(err);
      }
    }

    if (transformRules.method) {
      requests = this._applyMethod(requests, transformRules.method);
    }

    if (transformRules.recursive) {
      requests = this._applyRecursivePath(requests);
    }


    // Apply component transformers
    // if (transformRules.path) {
    //   requests = requests.flatMap(req => pathTransformer.transform(req, transformRules.path));
    // }

    let queryRequests = [];

    if (transformRules.query) {
      queryRequests = requests.flatMap(req => queryTransformer.transform(req, transformRules.query, authProfile));
    }

    let headerRequests = [];

    if (transformRules.header) {
      headerRequests = requests.flatMap(req => headersTransformer.transform(req, transformRules.header, authProfile));
    }

    let bodyRequests = [];

    if (transformRules.body) {
      bodyRequests = requests.flatMap(req => bodyTransformer.transform(req, transformRules.body, authProfile));
    }

    let allRequests = [...queryRequests, ...headerRequests, ...bodyRequests];

    allRequests = allRequests.map(req => this._rebuildUrl(req));

    return allRequests;
  },

  _rebuildUrl(request) {
    if (!request.url) return request;

    let baseUrl = request.url.split('?')[0];
    const queryParams = [];

    if (request.query) {
      for (const key in request.query) {
        if (request.query.hasOwnProperty(key)) {
          // queryParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(request.query[key])}`);
          queryParams.push(`${key}=${request.query[key]}`);
        }
      }
    }

    if (queryParams.length > 0) {
      request.url = `${baseUrl}?${queryParams.join('&')}`;
    } else {
      request.url = baseUrl;
    }

    return request;
  },

  _applyMethod(requests, methods) {

    if (!Array.isArray(methods)) {
      methods = [methods];
    }

    const result = [];

    requests.forEach(req => {
      methods.forEach(method => {
        const newReq = _.cloneDeep(req);
        newReq.method = method;
        result.push(newReq);
      });
    });

    return result;
  },

  _applyRecursivePath(requests) {
    const result = [];
    requests.forEach(req => {
      try {
        const originalUrl = new URL(req.url);
        let path = originalUrl.pathname;

        // Normalize path: remove trailing slash, unless it's just "/"
        if (path.length > 1 && path.endsWith('/')) {
          path = path.slice(0, -1);
        }

        // Loop, creating a request for each path level
        while (path) {
          const newReq = _.cloneDeep(req);
          const newUrl = new URL(req.url);
          newUrl.pathname = path;
          newReq.url = newUrl.toString();
          result.push(newReq);

          // Truncate the path for the next iteration.
          // Stop if we are at the root or a first-level path like '/users'.
          const lastSlashIndex = path.lastIndexOf('/');
          if (lastSlashIndex > 0) {
            path = path.substring(0, lastSlashIndex);
          } else {
            // This was the last segment (e.g., '/users' or '/'), so we stop.
            path = '';
          }
        }
      } catch (error) {
        console.error(`[!] Error parsing URL for recursive transform: ${req.url}`, error);
        // If URL is invalid, just add the original request and continue
        result.push(_.cloneDeep(req));
      }
    });
    return result;
  }
};