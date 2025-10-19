import _ from 'lodash';

export default {
  transform(request, pathRules) {
    if (!pathRules) return [request];

    // Handle transformations array (creates separate requests for each transformation)
    if (pathRules.transformations && Array.isArray(pathRules.transformations)) {
      const requests = [];
      pathRules.transformations.forEach(transformation => {
        const req = _.cloneDeep(request);
        let path = req.path || '';
        path = this._applyTransformation(path, transformation);
        req.path = path;
        requests.push(req);
      });

      // If there are global transformations, apply them to all generated requests
      if (pathRules.add || pathRules.remove || pathRules.modify || 
          pathRules.replace_all || pathRules.replace_all_one_by_one) {
        return requests.flatMap(req => this._applyGlobalRules(req, pathRules));
      }

      return requests;
    }

    return this._applyGlobalRules(request, pathRules);
  },

  _applyTransformation(path, transformation) {
    let newPath = path;
    Object.entries(transformation).forEach(([operator, config]) => {
      if (operator === 'add') {
        newPath = newPath + '/' + config;
      } else if (operator === 'remove') {
        newPath = newPath.replace(config, '');
      } else if (operator === 'modify' && typeof config === 'object') {
        Object.entries(config).forEach(([segment, replacement]) => {
          newPath = newPath.replace(segment, replacement);
        });
      }
    });
    return newPath;
  },

  _applyGlobalRules(request, pathRules) {
    const requests = [_.cloneDeep(request)];
    let path = requests[0].path || '';

    // Add to path
    if (pathRules.add) {
      path = path + '/' + pathRules.add;
    }

    // Remove from path
    if (pathRules.remove) {
      path = path.replace(pathRules.remove, '');
    }

    // Modify path segments
    if (pathRules.modify && typeof pathRules.modify === 'object') {
      Object.entries(pathRules.modify).forEach(([segment, replacement]) => {
        path = path.replace(segment, replacement);
      });
    }

    // Replace all occurrences in path
    if (pathRules.replace_all) {
      const segments = path.split('/');
      path = segments.map(seg => seg === '' ? '' : pathRules.replace_all).join('/');
    }

    // Replace all one by one (create separate requests)
    if (pathRules.replace_all_one_by_one) {
      return this._replaceAllOneByOne(request, path, pathRules.replace_all_one_by_one);
    }

    requests[0].path = path;
    return requests;
  },

  _replaceAllOneByOne(originalRequest, path, replacement) {
    const segments = path.split('/').filter(seg => seg !== '');
    
    return segments.map((_, index) => {
      const req = _.cloneDeep(originalRequest);
      const pathSegments = path.split('/');
      let segmentCount = 0;

      const newPath = pathSegments.map(seg => {
        if (seg === '') return seg;
        if (segmentCount === index) {
          segmentCount++;
          return replacement;
        }
        segmentCount++;
        return seg;
      }).join('/');

      req.path = newPath;
      return req;
    });
  }
};