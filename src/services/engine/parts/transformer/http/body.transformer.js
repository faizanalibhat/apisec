import _ from 'lodash';

export default {
  transform(request, bodyRules) {
    if (!bodyRules) return [request];


    let requests = [];

    // Handle transformations array (creates separate requests for each transformation)
    if (Array.isArray(bodyRules.transformations)) {
      for (const transformation of bodyRules.transformations) {
        const req = _.cloneDeep(request);
        const body = req.body || {};
        this._applyTransformation(body, transformation);
        req.body = body;
        requests.push(req);
      }
    }

    // If no transformation rules were applied, start with the original
    if (requests.length === 0) requests = [_.cloneDeep(request)];

    // Apply global rules (if any)
    if (bodyRules.add || bodyRules.remove || bodyRules.modify ||
        bodyRules.replace_all || bodyRules.replace_all_one_by_one) {
      const globalReqs = requests.flatMap(req => this._applyGlobalRules(req, bodyRules));
      if (globalReqs.length > 0) {
        requests = globalReqs;
      }
    }

    // ✅ Always return at least one request
    return requests.length > 0 ? requests : [_.cloneDeep(request)];
  },

  _applyTransformation(body, transformation) {
    Object.entries(transformation).forEach(([operator, config]) => {
      if (operator === 'add' && typeof config === 'object') {
        Object.assign(body, config);
      } else if (operator === 'remove' && Array.isArray(config)) {
        config.forEach(field => delete body[field]);
      } else if (operator === 'modify' && typeof config === 'object') {
        Object.entries(config).forEach(([field, cfg]) => {
          body[field] = this._applyModification(body[field], cfg);
        });
      }
    });
  },

  _applyGlobalRules(request, bodyRules) {
    const requests = [_.cloneDeep(request)];
    const body = requests[0].body || {};

    // Add fields
    if (bodyRules.add) Object.assign(body, bodyRules.add);

    // Remove fields
    if (Array.isArray(bodyRules.remove)) {
      bodyRules.remove.forEach(field => delete body[field]);
    }

    // Modify fields
    if (bodyRules.modify) {
      Object.entries(bodyRules.modify).forEach(([field, config]) => {
        body[field] = this._applyModification(body[field], config);
      });
    }

    // Replace all values with a string
    if (bodyRules.replace_all) {
      this._replaceAllValues(body, bodyRules.replace_all);
    }

    // Replace all values one by one (create separate requests)
    if (bodyRules.replace_all_one_by_one) {
      const replaced = this._replaceAllOneByOne(request, body, bodyRules.replace_all_one_by_one);
      // ✅ ensure we never return empty
      return replaced.length > 0 ? replaced : [_.cloneDeep(request)];
    }

    requests[0].body = body;
    return requests;
  },

  _applyModification(currentValue, config) {
    if (typeof config === 'string') {
      return config;
    } else if (typeof config === 'object') {
      let newValue = config.value !== undefined ? config.value : currentValue;
      if (config.prefix) newValue = config.prefix + newValue;
      if (config.suffix) newValue = newValue + config.suffix;
      return newValue;
    }
    return currentValue;
  },

  _replaceAllValues(obj, replacement) {
    Object.keys(obj).forEach(key => {
      if (typeof obj[key] === 'string' || typeof obj[key] === 'number') {
        obj[key] = replacement;
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this._replaceAllValues(obj[key], replacement);
      }
    });
  },

  _replaceAllOneByOne(originalRequest, body, replacement) {
    const values = [];
    this._collectAllValues(body, values);

    // ✅ if no values to replace, return original
    if (values.length === 0) return [_.cloneDeep(originalRequest)];

    // if body is json parsable
    const json = null;

    try {
      json = JSON.parse(body);
    }
    catch(err) {
      console.log("not json body ", body, typeof body);
      return [_.cloneDeep(originalRequest)]
    }

    return values.map((x, index) => {
      const req = _.cloneDeep(originalRequest);
      const newBody = _.cloneDeep(json);
      this._replaceValueAtIndex(newBody, replacement, index, { count: 0 });
      req.body = newBody;
      return req;
    });
  },

  _collectAllValues(obj, values) {
    Object.values(obj).forEach(val => {
      if (typeof val === 'string' || typeof val === 'number') {
        values.push(val);
      } else if (typeof val === 'object' && val !== null) {
        this._collectAllValues(val, values);
      }
    });
  },

  _replaceValueAtIndex(obj, replacement, targetIndex, counter) {
    Object.keys(obj).forEach(key => {
      if (typeof obj[key] === 'string' || typeof obj[key] === 'number') {
        if (counter.count === targetIndex) {
          obj[key] = replacement;
        }
        counter.count++;
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this._replaceValueAtIndex(obj[key], replacement, targetIndex, counter);
      }
    });
  }
};
