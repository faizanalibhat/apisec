import _ from "lodash";

function jsonCleanBody(body) {
  if (typeof body == "string") {
    return body.replace(/[\s\n\t]+/g, "");
  } else {
    return body;
  }
}

// helper functions one for each operation
function add(body, newParams, mode, language) {
  if (mode === "raw" && language === "json") {
    let newBody = JSON.parse(jsonCleanBody(body));
    newBody = Object.assign(newBody, newParams);
    return JSON.stringify(newBody);
  } else if (mode === "urlencoded" || mode === "formdata") {
    let newBody = _.cloneDeep(body);
    Object.entries(newParams).forEach(([key, value]) => {
      const existingIndex = newBody.findIndex((item) => item.key === key);
      if (existingIndex > -1) {
        newBody[existingIndex].value = value;
      } else {
        const item = { key, value };
        if (mode === "formdata") item.type = "text";
        newBody.push(item);
      }
    });
    return newBody;
  }
  return body;
}

function remove(body, removeParams, mode, language) {
  if (mode === "raw" && language === "json") {
    let newBody = JSON.parse(jsonCleanBody(body));
    removeParams.forEach((param) => delete newBody[param]);

    return JSON.stringify(newBody);
  } else if (mode === "urlencoded" || mode === "formdata") {
    let newBody = _.cloneDeep(body);
    return newBody.filter((item) => !removeParams.includes(item.key));
  }
  return body;
}

function modify(body, modifyParams, mode, language) {
  if (mode === "raw" && language === "json") {
    let newBody = JSON.parse(jsonCleanBody(body));

    Object.entries(modifyParams).forEach(([param, value]) => {
      if (newBody[param]) newBody[param] = value;
    });

    return JSON.stringify(newBody);
  } else if (mode === "urlencoded" || mode === "formdata") {
    let newBody = _.cloneDeep(body);
    Object.entries(modifyParams).forEach(([key, value]) => {
      const item = newBody.find((i) => i.key === key);
      if (item) item.value = value;
    });
    return newBody;
  }
  return body;
}

function replace_all_values(body, value, mode, language) {
  if (mode === "raw" && language === "json") {
    let newBody = JSON.parse(jsonCleanBody(body));
    Object.keys(newBody).forEach((key) => {
      newBody[key] = value;
    });

    return JSON.stringify(newBody);
  } else if (mode === "urlencoded" || mode === "formdata") {
    let newBody = _.cloneDeep(body);
    newBody.forEach((item) => (item.value = value));
    return newBody;
  }
  return body;
}

function replace_all_values_one_by_one(body, value, mode, language) {
  if (mode === "raw" && language === "json") {
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
    } catch (err) {
      console.log(err.message);
      return [];
    }
  } else if (mode === "urlencoded" || mode === "formdata") {
    try {
      const clonedList = [];
      for (let i = 0; i < body.length; i++) {
        let newBody = _.cloneDeep(body);
        newBody[i].value = value;
        clonedList.push(newBody);
      }
      return clonedList;
    } catch (err) {
      console.log(err.message);
      return [];
    }
  }
  return [];
}

function handleTransformation(body, transformations, mode, language) {
  const allParams = [];

  for (let transformation of transformations) {
    const cloneParam = body;
    allParams.push(
      ...(applyRules(cloneParam, transformation, mode, language) || []),
    );
  }

  return allParams;
}

function applyRules(body, rules, mode, language) {
  let allBodies = [];

  let modified = body;

  if (rules.add) {
    modified = add(modified, rules.add, mode, language);
  }

  if (rules.remove) {
    modified = remove(modified, rules.remove, mode, language);
  }

  if (rules.modify) {
    modified = modify(modified, rules.modify, mode, language);
  }

  if (rules.replace_all_values) {
    modified = replace_all_values(
      modified,
      rules.replace_all_values,
      mode,
      language,
    );
  }

  if (rules.replace_all_values_one_by_one) {
    allBodies = replace_all_values_one_by_one(
      modified,
      rules.replace_all_values_one_by_one,
      mode,
      language,
    );
  }

  if (rules.transformations) {
    if (allBodies.length) {
      let transformedParams = [];
      for (let p of allBodies) {
        transformedParams.push(
          ...(handleTransformation(p, rules.transformations, mode, language) ||
            []),
        );
      }

      allBodies.push(...transformedParams);
    } else {
      allBodies = handleTransformation(
        modified,
        rules.transformations,
        mode,
        language,
      );
    }

    return allBodies;
  }

  return allBodies?.length > 0 ? allBodies : [modified];
}

export default {
  transform(request, bodyRules, authProfile) {
    if (!bodyRules) return [];

    let requests = [];

    const targetBody = request.body;

    // Determine mode and language
    let mode = request.format || "raw";
    let language = request.language || "json";

    // Fallback/Compatibility
    if (request.body_format && !request.format) {
      if (request.body_format === "json") {
        mode = "raw";
        language = "json";
      }
    }

    if (!targetBody) return [];

    const transformedBodies = applyRules(targetBody, bodyRules, mode, language);

    requests = transformedBodies.map((body) => {
      const newRequest = _.cloneDeep(request);
      newRequest.body = body;
      newRequest.mode = mode;
      newRequest.language = language;

      // add auth profile
      if (authProfile) {
        let newHeaders = { ...(newRequest.headers || {}) };

        // newHeaders.authorization = authProfile.authValue;

        authProfile?.customHeaders?.map?.(({ key, value }) => {
          newHeaders[key] = value;
        });

        newRequest.headers = newHeaders;
      }

      return newRequest;
    });

    return requests;
  },
};
