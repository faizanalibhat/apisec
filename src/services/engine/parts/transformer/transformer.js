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
    }

    if (transformRules.header) {
      requests = requests.flatMap(req => headersTransformer.transform(req, transformRules.header));
    }

    if (transformRules.body) {
      requests = requests.flatMap(req => bodyTransformer.transform(req, transformRules.body));
      console.log("transformed body: ", requests);
    }


    return requests;
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