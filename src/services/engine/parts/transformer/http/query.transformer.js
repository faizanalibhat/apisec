import _ from 'lodash';



// helper functions one for each operation
function add(params, newParams) {
  Object.assign(params, newParams);
}

function remove(params, removeParams) {
  removeParams.forEach(param => delete params[param]);
}

function modify(params, modifyParams) {
  Object.entries(modifyParams).forEach(([key, value]) => {
    params[key] = value;
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

  if (rules.transformations) {
    allParams = handleTransformation(params, rules.transformations);

    return allParams;
  }

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

  return allParams.length > 0 ? allParams : [params];
}




export default {
  transform(request, queryRules) {

    if (!queryRules) return [request];

    let requests = [_.cloneDeep(request)];

    const targetParams = requests[0].params || {};

    const transformedParams = applyRules(targetParams, queryRules);

    requests = transformedParams.map(params => {
      const newRequest = _.cloneDeep(request);
      newRequest.params = params;
      return newRequest;
    });

    return requests;
  }
};
