function contains(target, match) {

    if (typeof match == 'string') {
      return target.includes(match);
    }
    else if (Array.isArray(match)) {
      for (let m of match) {
        return target.includes(m);
      }
    }
    else if (typeof match == 'object') {
      let matches = match.value;
      let options = match.options;

      for (let m of matches) {

        if (options.regex) {
          const regex = new RegExp(m);
          return regex.test(target);
        }
        else {
          return target.includes(m);
        }
      }
    }
}

function statusMatch(status, match) {
  if (typeof match == 'number') {
    return status == match;
  }
  else if (Array.isArray(match)) {
    for (let m of match) {
      return status == m;
    }
  }
  else if (typeof match == 'object') {
    if (match.in && Array.isArray(match.in)) {
      return match.in.includes(status);
    }
    else if (match.notIn && Array.isArray(match.notIn)) {
      return !match.notIn.includes(status);
    }
  }
}

function bodyMatch(body, match) {
  if (match.contains) {
    return contains(JSON.stringify(body), match.contains);
  }

  if (match.regex) {
    const regex = new RegExp(match.regex);
    return regex.test(JSON.stringify(body));
  }
}

function headerMatch(header, match) {
  if (match.contains) {
    return contains(JSON.stringify(header), match.contains);
  }

  if (match.regex) {
    const regex = new RegExp(match.regex);
    return regex.test(JSON.stringify(header));
  }

  for (let [key,val] of Object.entries(match)) {

    let target = header[key?.toLowerCase?.()];

    if (!target) return false;

    if (typeof val == 'string') {
      return target == val;
    }

    if (val.contains) {
      return contains(target, val.contains);
    }

    if (val.regex) {
      const regex = new RegExp(val.regex);
      return regex.test(target);
    }
  }
}


const match = ({ rule, response }) => {
  const allMatches = [];

  if (rule.status) {
    const statusMatchResult = statusMatch(response.status, rule.status);
    allMatches.push(statusMatchResult);
  }

  if (rule.body) {
    const bodyMatchResult = bodyMatch(response.body, rule.body);
    allMatches.push(bodyMatchResult);
  }

  if (rule.header) {
    const headerMatchResult = headerMatch(response.headers, rule.header);
    allMatches.push(headerMatchResult);
  }

  const match = allMatches.every(v => v);

  return { match }
}

const matcher = { match };

export { matcher };
