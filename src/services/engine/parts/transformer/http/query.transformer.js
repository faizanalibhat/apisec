import _ from 'lodash';


function normalizeParams(query) {
    const normalized = {};
    for (let [key, value] of Object.entries(query)) {
      normalized[key.toLowerCase()] = value;
    }
    return normalized;
}




// helper functions one for each operation
function add(params, newParams) {
  Object.assign(params, newParams);
}

function remove(params, removeParams) {
  removeParams.forEach(param => delete params[param]);
}

function modify(params, modifyParams) {
  Object.entries(modifyParams).forEach(([key, value]) => {
    if (params[key]) params[key] = value;
  });
}

function replace_all_values(params, value) {
  Object.keys(params).forEach(key => {
    params[key] = value;
  });
}


function replace_all_values_one_by_one(params, value) {
  const paramKeys = Object.keys(params);

  const clonedList = [];

  for (let key of paramKeys) {
    const clonedParams = _.cloneDeep(params);
    clonedParams[key] = value;

    clonedList.push(clonedParams);
  }

  return clonedList;
}


function handleTransformation(params, transformations) {
  const allParams = [];

  for (let transformation of transformations) {
    const cloneParam = _.cloneDeep(params);
    allParams.push(...(applyRules(cloneParam, transformation) || []));
  }

  return allParams;
}



function applyRules(params, rules) {
  let allParams = [];

  params = normalizeParams(params);
  const original = _.cloneDeep(params);


  if (rules.add) {
    add(params, rules.add);
  }

  if (rules.remove) {
    remove(params, rules.remove);
  }

  if (rules.modify) {
    modify(params, rules.modify);
  }

  if (rules.replace_all_values) {
    replace_all_values(params, rules.replace_all_values);
  }

  if (rules.replace_all_values_one_by_one) {
    allParams = replace_all_values_one_by_one(params, rules.replace_all_values_one_by_one);
  }

  if (rules.transformations) {
    if (allParams.length) {
      let transformedParams = []
      for (let p of allParams) {
        transformedParams.push(...(handleTransformation(p, rules.transformations) || []));
      }

      allParams.push(...transformedParams);
    }
    else {
      allParams = handleTransformation(params, rules.transformations);
    }

    return allParams;
  }

  const changed = !_.isEqual(params, original);

  console.log("[+] Params CHANGED : ", changed, params);

  if (!allParams.length && !changed) {
    return [];
  }

  return allParams?.length > 0 ? allParams : [params];
}




export default {
  transform(request, queryRules, authProfile) {

    if (!queryRules) return [];

    let requests = [];

    const targetParams = _.cloneDeep(request.params || {});

    if (!Object.keys(targetParams).length) return [];

    const transformedParams = applyRules(targetParams, queryRules);

    requests = transformedParams.map(params => {
      const newRequest = _.cloneDeep(request);
      newRequest.params = params;
      
      // add auth profile
      if (authProfile) {
        let newHeaders = { ...(newRequest.headers || {}) };

        // newHeaders.authorization = authProfile.authValue;

        authProfile?.customHeaders?.map?.(({key, value}) => {
          newHeaders[key] = value;
        });

        newRequest.headers = newHeaders;
      }

      return newRequest;
    });

    return requests;
  }
};
