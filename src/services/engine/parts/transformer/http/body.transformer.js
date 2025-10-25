import _ from 'lodash';



// helper functions one for each operation
function add(body, newParams, format) {
  if (format === 'json') {
    let newBody = JSON.parse(body);
    newBody = Object.assign(newBody, newParams);
    body = JSON.stringify(newBody);

    return body;
  } else {
    // add other logic here
  }
}

function remove(body, removeParams, format) {
  if (format === 'json') {
    let newBody = JSON.parse(body);
    removeParams.forEach(param => delete newBody[param]);

    body = JSON.stringify(newBody);

    return body;
  }
  else {}
}

function modify(body, modifyParams, format) {
  if (format === 'json') {
    let newBody = JSON.parse(body);

    Object.entries(modifyParams).forEach((param, value) => {
      if (newBody[param]) newBody[param] = value;
    });

    body = JSON.stringify(newBody);

    return body;
  }
  else {}
}

function replace_all_values(body, value, format) {
  if (format === 'json') {
    let newBody = JSON.parse(body);
    Object.keys(newBody).forEach(key => {
      newBody[key] = value;
    });

    body = JSON.stringify(newBody);

    return body;
  }
  else {}
}


function replace_all_values_one_by_one(body, value, format) {

  if (format === 'json') {
    try {
      const cleanBody = body.replace(/[\s\n\t]+/g, '');

      let newBody = JSON.parse(cleanBody);

      const paramKeys = Object.keys(newBody);

      const clonedList = [];

      for (let key of paramKeys) {
        const clonedParams = _.cloneDeep(newBody);
        clonedParams[key] = value;

        clonedList.push(JSON.stringify(clonedParams));
      }

      return clonedList;
    }
    catch(err) {
      console.log(err.message);
      return [];
    }
  }
}


function handleTransformation(body, transformations, format) {
  const allParams = [];

  for (let transformation of transformations) {
    const cloneParam = _.cloneDeep(body);
    allParams.push(...(applyRules(cloneParam, transformation, format) || []));
  }

  return allParams;
}


function applyRules(body, rules, format) {
  let allBodies = [];

  // if (rules.transformations) {
  //   allBodies = handleTransformation(body, rules.transformations, format);

  //   return allBodies;
  // }

  let modified = body;

  if (rules.add) {
    modified = add(modified, rules.add, format);
  }

  if (rules.remove) {
    modified = remove(modified, rules.remove, format);
  }

  if (rules.modify) {
    modified = modify(modified, rules.modify, format);
  }

  if (rules.replace_all_values) {
    modified = replace_all_values(modified, rules.replace_all_values, format);
  }

  if (rules.replace_all_values_one_by_one) {
    allBodies = replace_all_values_one_by_one(modified, rules.replace_all_values_one_by_one, format);
  }

  if (rules.transformations) {
    if (allBodies.length) {
      let transformedParams = []
      for (let p of allBodies) {
        transformedParams.push(...(handleTransformation(p, rules.transformations) || []));
      }

      allBodies.push(...transformedParams);
    }
    else {
      allBodies = handleTransformation(modified, rules.transformations);
    }

    return allBodies;
  }

  // return allHeaders.length > 0 ? allHeaders : [headers];

  return allBodies?.length > 0 ? allBodies : [modified];
}


export default {
  transform(request, bodyRules) {

    if (!bodyRules) return [request];

    let requests = [_.cloneDeep(request)];

    const targetBody = requests[0].body || {};
    const bodyFormat = requests[0].body_format || 'json';

    const transformedBodies = applyRules(targetBody, bodyRules, bodyFormat);

    requests = transformedBodies.map(body => {
      const newRequest = _.cloneDeep(request);
      newRequest.body = body;
      return newRequest;
    });

    return requests;
  }
};
