import _ from 'lodash';

export default {
  transform(request, headersRules) {
    if (!headersRules) return [request];

    // Handle transformations array (creates separate requests for each transformation)
    if (headersRules.transformations && Array.isArray(headersRules.transformations)) {
      const requests = [];
      headersRules.transformations.forEach(transformation => {
        const req = _.cloneDeep(request);
        const headers = req.headers || {};
        this._applyTransformation(headers, transformation);
        req.headers = headers;
        requests.push(req);
      });

      // If there are global transformations, apply them to all generated requests
      if (headersRules.add || headersRules.remove || headersRules.modify) {
        return requests.flatMap(req => this._applyGlobalRules(req, headersRules));
      }

      return requests;
    }

    return this._applyGlobalRules(request, headersRules);
  },

  _applyTransformation(headers, transformation) {
    Object.entries(transformation).forEach(([operator, config]) => {
      if (operator === 'add' && typeof config === 'object') {
        Object.assign(headers, config);
      } else if (operator === 'remove' && Array.isArray(config)) {
        config.forEach(header => {
          delete headers[header];
        });
      } else if (operator === 'modify' && typeof config === 'object') {
        Object.entries(config).forEach(([header, cfg]) => {
          const headerName = Object.keys(headers).find(h => h.toLowerCase() === header.toLowerCase()) || header;
          if (headerName.toLowerCase() === 'cookie') {
            this._modifyCookieHeader(headers, headerName, cfg);
          } else {
            headers[headerName] = this._applyModification(headers[headerName], cfg);
          }
        });
      }
    });
  },

  _applyGlobalRules(request, headersRules) {
    const requests = [_.cloneDeep(request)];
    const headers = requests[0].headers || {};

    // Add headers
    if (headersRules.add) {
      Object.assign(headers, headersRules.add);
    }

    // Remove headers
    if (headersRules.remove && Array.isArray(headersRules.remove)) {
      headersRules.remove.forEach(header => {
        delete headers[header];
      });
    }

    // Modify headers (with special handling for cookie headers)
    if (headersRules.modify) {
      Object.entries(headersRules.modify).forEach(([header, config]) => {
        if (header.toLowerCase() === 'cookie') {
          this._modifyCookieHeader(headers, header, config);
        } else {
          headers[header] = this._applyModification(headers[header], config);
        }
      });
    }

    requests[0].headers = headers;
    return requests;
  },

  _modifyCookieHeader(headers, headerName, config) {
    const currentCookie = headers[headerName] || '';
    const cookies = this._parseCookies(currentCookie);

    // Add cookies
    if (config.add) {
      Object.assign(cookies, config.add);
    }

    // Remove cookies
    if (config.remove && Array.isArray(config.remove)) {
      config.remove.forEach(name => {
        delete cookies[name];
      });
    }

    // Modify cookies
    if (config.modify) {
      Object.entries(config.modify).forEach(([cookieName, modification]) => {
        const currentValue = cookies[cookieName] || '';
        let newValue = currentValue;

        if (modification.prefix) {
          newValue = modification.prefix + newValue;
        }
        if (modification.suffix) {
          newValue = newValue + modification.suffix;
        }

        cookies[cookieName] = newValue;
      });
    }

    headers[headerName] = this._serializeCookies(cookies);
  },

  _parseCookies(cookieString) {
    const cookies = {};
    if (!cookieString) return cookies;

    cookieString.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name) {
        cookies[name] = value || '';
      }
    });

    return cookies;
  },

  _serializeCookies(cookieObj) {
    return Object.entries(cookieObj)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  },

  _applyModification(currentValue, config) {
    if (typeof config === 'string') {
      return config;
    } else if (typeof config === 'object') {
      let newValue = config.value !== undefined ? config.value : currentValue;

      if (config.prefix) {
        newValue = config.prefix + newValue;
      }
      if (config.suffix) {
        newValue = newValue + config.suffix;
      }

      return newValue;
    }

    return currentValue;
  }
};