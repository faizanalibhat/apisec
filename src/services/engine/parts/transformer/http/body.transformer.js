import _ from 'lodash';



// helper functions one for each operation
function add(body, newParams) {
  Object.assign(body, newParams);
}

function remove(body, removeParams) {
  removeParams.forEach(param => delete body[param]);
}

function modify(body, modifyParams) {
  Object.entries(modifyParams).forEach(([key, value]) => {
    if (body[key]) body[key] = value;
  });
}

function replace_all_values(body, value) {
  Object.keys(body).forEach(key => {
    body[key] = value;
  });
}


function replace_all_values_one_by_one(body, value) {
  const paramKeys = Object.keys(body);

  const clonedList = [];

  for (let key of paramKeys) {
    const clonedParams = _.cloneDeep(body);
    clonedParams[key] = value;

    clonedList.push(clonedParams);
  }

  return clonedList;
}


function handleTransformation(body, transformations) {
  const allParams = [];

  for (let transformation of transformations) {
    const cloneParam = _.cloneDeep(body);
    allParams.push(...(applyRules(cloneParam, transformation) || []));
  }

  return allParams;
}



function applyRules(body, rules) {
  let allParams = [];

  if (rules.transformations) {
    allParams = handleTransformation(body, rules.transformations);

    return allParams;
  }

  if (rules.add) {
    add(body, rules.add);
  }

  if (rules.remove) {
    remove(body, rules.remove);
  }

  if (rules.modify) {
    modify(body, rules.modify);
  }

  if (rules.replace_all_values) {
    replace_all_values(body, rules.replace_all_values);
  }

  if (rules.replace_all_values_one_by_one) {
    allParams = replace_all_values_one_by_one(body, rules.replace_all_values_one_by_one);
  }

  return allParams.length > 0 ? allParams : [params];
}




export default {
  transform(request, bodyRules) {

    if (!bodyRules) return [request];

    let requests = [_.cloneDeep(request)];

    const targetBody = requests[0].body || {};

    const transformedParams = applyRules(targetBody, bodyRules);

    requests = transformedParams.map(body => {
      const newRequest = _.cloneDeep(request);
      newRequest.body = body;
      return newRequest;
    });

    return requests;
  }
};
