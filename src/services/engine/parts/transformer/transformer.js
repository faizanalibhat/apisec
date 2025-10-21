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

    console.log("[+] STEP 1 ", requests);

    // Apply global operators (method, http_version)
    if (transformRules.method) {
      requests = this._applyMethod(requests, transformRules.method);

      console.log("[+] STEP 2 ", requests);
    }


    if (transformRules.http_version) {
      requests = requests.map(req => {
        req.http_version = transformRules.http_version;
        return req;
      });

      console.log("[+] STEP II ", requests);
    }


    // Apply component transformers
    if (transformRules.path) {
      requests = requests.flatMap(req => pathTransformer.transform(req, transformRules.path));
      console.log("[+] STEP 4 ", requests);
    }


    if (transformRules.query) {
      requests = requests.flatMap(req => queryTransformer.transform(req, transformRules.query));
      console.log("[+] STEP 5 ", requests);
    }

    if (transformRules.header) {
      requests = requests.flatMap(req => headersTransformer.transform(req, transformRules.header));
      console.log("[+] STEP 6 ", requests);
    }

    if (transformRules.body) {
      requests = requests.flatMap(req => bodyTransformer.transform(req, transformRules.body));
      console.log("[+] STEP 7 ", requests);
    }

    console.log("[+] STEP 8 ", requests);

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