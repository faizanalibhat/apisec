import _ from 'lodash';
import bodyTransformer from './http/body.transformer.js';
import headersTransformer from './http/header.transformer.js';
import queryTransformer from './http/query.transformer.js';
import pathTransformer from './http/path.transformer.js';


export const transformer = {
  transform({ request, rule }) {
    const transformRules = rule.transform;

    if (!transformRules) return [request];

    let requests = [_.cloneDeep(request)];

    // Apply global operators (method, http_version)
    if (transformRules.method) {
      requests = this._applyMethod(requests, transformRules.method);
    }


    if (transformRules.http_version) {
      requests = requests.map(req => {
        req.http_version = transformRules.http_version;
        return req;
      });
    }


    // Apply component transformers
    if (transformRules.path) {
      requests = requests.flatMap(req => pathTransformer.transform(req, transformRules.path));
    }


    if (transformRules.query) {
      requests = requests.flatMap(req => queryTransformer.transform(req, transformRules.query));
      console.log("[+] appliying rules: ", transformRules.query, requests);
    }

    if (transformRules.header) {
      requests = requests.flatMap(req => headersTransformer.transform(req, transformRules.header));
    }

    if (transformRules.body) {
      requests = requests.flatMap(req => bodyTransformer.transform(req, transformRules.body));
    }

    requests = requests.map(req => this._rebuildUrl(req));


    return requests;
  },

  _rebuildUrl(request) {
    if (!request.url) return request;

    let baseUrl = request.url.split('?')[0];
    const queryParams = [];

    if (request.query) {
      for (const key in request.query) {
        if (request.query.hasOwnProperty(key)) {
          queryParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(request.query[key])}`);
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
  }
};