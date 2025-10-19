import _ from 'lodash';

export default {
  transform(request, queryRules) {
    if (!queryRules) return [request];

    let requests = [_.cloneDeep(request)];

    // Handle transformations array (creates separate requests for each transformation)
    if (queryRules.transformations && Array.isArray(queryRules.transformations)) {
      requests = [];
      queryRules.transformations.forEach(transformation => {
        const req = _.cloneDeep(request);
        const params = req.query || {};

        Object.entries(transformation).forEach(([operator, config]) => {
          if (operator === 'add' && typeof config === 'object') {
            Object.assign(params, config);
          } else if (operator === 'remove' && Array.isArray(config)) {
            config.forEach(param => {
              delete params[param];
            });
          }
        });

        req.query = params;
        requests.push(req);
      });

      // If there are global transformations, apply them to all generated requests
      if (queryRules.add || queryRules.remove || queryRules.modify || 
          queryRules.replace_all_values || queryRules.replace_all_values_one_by_one) {
        requests = requests.flatMap(req => 
          this._applyGlobalRules(req, queryRules)
        );
      }

      return requests;
    }

    // Apply global rules if no transformations array
    return requests.flatMap(req => this._applyGlobalRules(req, queryRules));
  },

  _applyGlobalRules(request, queryRules) {
    const requests = [_.cloneDeep(request)];
    const params = requests[0].query || {};

    // Add parameters
    if (queryRules.add) {
      Object.assign(params, queryRules.add);
    }

    // Remove parameters
    if (queryRules.remove && Array.isArray(queryRules.remove)) {
      queryRules.remove.forEach(param => {
        delete params[param];
      });
    }

    // Modify parameters
    if (queryRules.modify) {
      Object.entries(queryRules.modify).forEach(([param, newVal]) => {
        params[param] = newVal;
      });
    }

    // Replace all values
    if (queryRules.replace_all_values) {
      Object.keys(params).forEach(key => {
        params[key] = queryRules.replace_all_values;
      });
    }

    // Replace all values one by one (create separate requests)
    if (queryRules.replace_all_values_one_by_one) {
      const paramKeys = Object.keys(params);
      requests[0].query = params;
      return paramKeys.map((key, index) => {
        const req = _.cloneDeep(request);
        const newParams = _.cloneDeep(params);
        newParams[key] = queryRules.replace_all_values_one_by_one;
        req.query = newParams;
        return req;
      });
    }

    requests[0].query = params;
    return requests;
  }
};