function contains(target, match) {

    if (typeof match == 'string') {
      const regex = new RegExp(match, 'gi');
      return regex.test(target);
    }
    else if (Array.isArray(match)) {
      for (let m of match) {
        const regex = new RegExp(m, 'gi');
        if (regex.test(target)) return true;
      }
      return false;
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

  const matchRule = rule.match_on;

  if (!matchRule) return { match: false };

  if (matchRule.status) {
    const statusMatchResult = statusMatch(response.status, matchRule.status);
    allMatches.push(statusMatchResult);
  }

  if (matchRule.body) {
    const bodyMatchResult = bodyMatch(response.body, matchRule.body);
    allMatches.push(bodyMatchResult);
  }

  if (matchRule.header) {
    const headerMatchResult = headerMatch(response.headers, matchRule.header);
    allMatches.push(headerMatchResult);
  }

  console.log(allMatches)

  const match = allMatches.every(m => m);

  console.log("final match: ", match);

  return { match }
}

const matcher = { match };

export { matcher };
