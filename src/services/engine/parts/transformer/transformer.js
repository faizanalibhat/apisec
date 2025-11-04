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


    let methodVariations = [];
    if (transformRules.method) {
      methodVariations = this._applyMethod(requests, transformRules.method);
    }


    let versionVariations = [];
    if (transformRules.http_version) {
      versionVariations = requests.map(req => {
        req.version = transformRules.http_version;
        return req;
      });
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

    let allRequests = [...methodVariations, ...versionVariations, ...queryRequests, ...headerRequests, ...bodyRequests];

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
  }
};