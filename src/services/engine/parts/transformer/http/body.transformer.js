import _ from 'lodash';


function jsonCleanBody(body) {
    if (typeof body == "string") {
        return body.replace(/[\s\n\t]+/g, '');
    }
    else {
        return body;
    }
}


// helper functions one for each operation
function add(body, newParams, format) {
  if (format === 'json') {
    let newBody = JSON.parse(jsonCleanBody(body));
    newBody = Object.assign(newBody, newParams);
    return JSON.stringify(newBody);
  } else {
    // add other logic here
  }
}

function remove(body, removeParams, format) {
  if (format === 'json') {
    let newBody = JSON.parse(jsonCleanBody(body));
    removeParams.forEach(param => delete newBody[param]);

    return JSON.stringify(newBody);
  }
  else {}
}

function modify(body, modifyParams, format) {
  if (format === 'json') {
    let newBody = JSON.parse(jsonCleanBody(body));

    Object.entries(modifyParams).forEach((param, value) => {
      if (newBody[param]) newBody[param] = value;
    });

    return JSON.stringify(newBody);
  }
  else {}
}

function replace_all_values(body, value, format) {
  if (format === 'json') {
    let newBody = JSON.parse(jsonCleanBody(body));
    Object.keys(newBody).forEach(key => {
      newBody[key] = value;
    });

    return JSON.stringify(newBody);
  }
  else {}
}


function replace_all_values_one_by_one(body, value, format) {

  if (format === 'json') {
    try {
      const cleanBody = jsonCleanBody(body);

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
    const cloneParam = body;
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

  console.log("[+] AFTER ADD : ", modified);

  if (rules.remove) {
    modified = remove(modified, rules.remove, format);
  }

  console.log("[+] AFTER REMOVE : ", modified);

  if (rules.modify) {
    modified = modify(modified, rules.modify, format);
  }

  console.log("[+] AFTER MODIFY : ", modified);

  if (rules.replace_all_values) {
    modified = replace_all_values(modified, rules.replace_all_values, format);
  }

  console.log("[+] AFTER REPLACE ALL : ", modified);

  if (rules.replace_all_values_one_by_one) {
    allBodies = replace_all_values_one_by_one(modified, rules.replace_all_values_one_by_one, format);
  }

  console.log("[+] AFTER REPLACE ALL ONE BY ONE : ", modified);

  if (rules.transformations) {
    if (allBodies.length) {
      let transformedParams = []
      for (let p of allBodies) {
        transformedParams.push(...(handleTransformation(p, rules.transformations, format) || []));
      }

      allBodies.push(...transformedParams);
    }
    else {
      allBodies = handleTransformation(modified, rules.transformations, format);
    }

    return allBodies;
  }

  console.log("[+] AFTER TRANSFORMATIONS :  ", allBodies);

  return allBodies?.length > 0 ? allBodies : [modified];
}


export default {
  transform(request, bodyRules, authProfile) {

    if (!bodyRules) return [];

    let requests = [];

    const targetBody = request.body || {};
    const bodyFormat = request.body_format || 'json';

    if (!targetBody || !bodyFormat) return [];

    const transformedBodies = applyRules(targetBody, bodyRules, bodyFormat);

    requests = transformedBodies.map(body => {
      const newRequest = _.cloneDeep(request);
      newRequest.body = body;

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
