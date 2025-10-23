import _ from 'lodash';


// helper functions one for each operation
function add(headers, newHeaders) {
  Object.assign(headers, newHeaders);
}

function remove(headers, removeHeaders) {
  removeHeaders.forEach(header => delete headers[header]);
}

function modify(headers, modifyHeaders) {
  Object.entries(modifyHeaders).forEach(([key, value]) => {
    if (params[key]) headers[key] = value;
  });
}

function replace_all_values(headers, value) {
  Object.keys(headers).forEach(key => {
    headers[key] = value;
  });
}


function replace_all_values_one_by_one(headers, value) {
  const paramKeys = Object.keys(headers);

  const clonedList = [];

  for (let key of paramKeys) {
    const clonedParams = _.cloneDeep(params);
    clonedParams[key] = value;

    clonedList.push(clonedParams);
  }

  return clonedList;
}


function handleTransformation(headers, transformations) {
  const allHeaders = [];

  for (let transformation of transformations) {
    const cloneHeader = _.cloneDeep(headers);
    allHeaders.push(...(applyRules(cloneHeader, transformation) || []));
  }

  return allHeaders;
}


function applyRules(headers, rules) {
  let allHeaders = [];

  if (rules.transformations) {
    allHeaders = handleTransformation(headers, rules.transformations);

    return allHeaders;
  }

  if (rules.add) {
    add(headers, rules.add);
  }

  if (rules.remove) {
    remove(headers, rules.remove);
  }

  if (rules.modify) {
    modify(headers, rules.modify);
  }

  if (rules.replace_all_values) {
    replace_all_values(headers, rules.replace_all_values);
  }

  if (rules.replace_all_values_one_by_one) {
    allHeaders = replace_all_values_one_by_one(headers, rules.replace_all_values_one_by_one);
  }

  return allHeaders.length > 0 ? allHeaders : [headers];
}




export default {
  transform(request, headerRules) {

    if (!headerRules) return [request];

    let requests = [_.cloneDeep(request)];

    const targetHeaders = requests[0].headers || {};

    const transformedHeaders = applyRules(targetHeaders, headerRules);

    requests = transformedHeaders.map(headers => {
      const newRequest = _.cloneDeep(request);
      newRequest.headers = headers;
      return newRequest;
    });

    return requests;
  }
};
