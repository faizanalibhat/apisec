function escapeRegex(regex) {
  return regex.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function regexMatch(target, regex) {
  const regexObj = new RegExp(escapeRegex(regex), 'gi');
  return regexObj.test(target);
}


function contains(target, match) {

    if (typeof match == 'string') {
      return regexMatch(target, match);
    }
    else if (Array.isArray(match)) {
      for (let m of match) {
        if (regexMatch(target, m)) return true;
      }
      return false;
    }
    else if (typeof match == 'object') {
      let matches = match.value;
      let options = match.options;

      for (let m of matches) {

        if (options.regex) {
          return regexMatch(target, m);
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
    return match.includes(status);
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

  if (response?.body && matchRule.body) {
    const bodyMatchResult = bodyMatch(response.body, matchRule.body);
    allMatches.push(bodyMatchResult);
  }

  if (response?.headers && matchRule.header) {
    const headerMatchResult = headerMatch(response.headers, matchRule.header);

    allMatches.push(headerMatchResult);
  }

  console.log("all matches: ", allMatches)

  const match = allMatches.every(m => m);

  console.log("final match: ", match);

  return { match }
}

const matcher = { match };

export { matcher };
