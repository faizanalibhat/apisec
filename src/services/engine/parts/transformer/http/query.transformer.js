import _ from 'lodash';

export default {
  transform(request, queryRules) {

    if (!queryRules) return [request];

    let requests = [_.cloneDeep(request)];

    // Handle transformations array (creates separate requests for each transformation)
    if (Array.isArray(queryRules.transformations)) {
      const transformedReqs = [];

      for (const transformation of queryRules.transformations) {
        const req = _.cloneDeep(request);
        const params = req.query || {};

        Object.entries(transformation).forEach(([operator, config]) => {
          if (operator === 'add' && typeof config === 'object') {
            Object.assign(params, config);
          } else if (operator === 'remove' && Array.isArray(config)) {
            config.forEach(param => delete params[param]);
          }
        });

        req.query = params;
        transformedReqs.push(req);
      }

      // Combine original + transformed
      requests = [...requests, ...transformedReqs];

      // Apply global rules if any
      if (queryRules.add || queryRules.remove || queryRules.modify || queryRules.replace_all_values || queryRules.replace_all_values_one_by_one) {
        const globalReqs = requests.flatMap(req => this._applyGlobalRules(req, queryRules));
        if (globalReqs.length > 0) requests = globalReqs;
      }
    } else {
      // Apply global rules directly
      const globalReqs = requests.flatMap(req => this._applyGlobalRules(req, queryRules));
      if (globalReqs.length > 0) requests = globalReqs;
    }

    // ✅ Always return at least the original request
    return requests.length > 0 ? requests : [_.cloneDeep(request)];
  },

  _applyGlobalRules(request, queryRules) {
    const requests = [_.cloneDeep(request)];
    const params = requests[0].params || {};

    // Add parameters
    if (queryRules.add) Object.assign(params, queryRules.add);

    // Remove parameters
    if (Array.isArray(queryRules.remove))
      queryRules.remove.forEach(param => delete params[param]);

    // Modify parameters
    if (queryRules.modify)
      Object.entries(queryRules.modify).forEach(([param, newVal]) => {
        params[param] = newVal;
      });

    // Replace all values
    if (queryRules.replace_all_values)
      Object.keys(params).forEach(key => {
        params[key] = queryRules.replace_all_values;
      });

    // Replace all values one by one (create separate requests)
    if (queryRules.replace_all_values_one_by_one) {
      console.log("[+] replacing values one by one.");
      const paramKeys = Object.keys(params);
      if (paramKeys.length === 0) return [_.cloneDeep(request)];

      return paramKeys.map(key => {
        const req = _.cloneDeep(request);
        const newParams = _.cloneDeep(params);
        newParams[key] = queryRules.replace_all_values_one_by_one;

        console.log("replaced query: ", key, queryRules.replace_all_values_one_by_one);

        req.params = newParams;
        return req;
      });
    }

    requests[0].params = params;
    return requests;
  }
};
