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
  let isMatch = false;
  if (typeof match == 'number') {
    isMatch = status == match;
  }
  else if (Array.isArray(match)) {
    isMatch = match.includes(status);
  }
  else if (typeof match == 'object') {
    if (match.in && Array.isArray(match.in)) {
      isMatch = match.in.includes(status);
    }
    else if (match.notIn && Array.isArray(match.notIn)) {
      isMatch = !match.notIn.includes(status);
    }
  }

  if (isMatch) {
    return { location: 'status', matched_on: status };
  }
  return null;
}

function bodyMatch(body, match) {
  let isMatch = false;
  if (match.contains) {
    isMatch = contains(JSON.stringify(body), match.contains);
  }

  if (match.regex) {
    const regex = new RegExp(match.regex);
    isMatch = regex.test(JSON.stringify(body));
  }

  if (isMatch) {
    return { location: 'body', matched_on: match };
  }
  return null;
}

function headerMatch(header, match) {
  let isMatch = false;
  if (match.contains) {
    isMatch = contains(JSON.stringify(header), match.contains);
  }

  if (match.regex) {
    const regex = new RegExp(match.regex);
    isMatch = regex.test(JSON.stringify(header));
  }

  for (let [key,val] of Object.entries(match)) {

    let target = header[key?.toLowerCase?.()];

    if (!target) continue;

    if (typeof val == 'string') {
      isMatch = target == val;
    }

    if (val.contains) {
      isMatch = contains(target, val.contains);
    }

    if (val.regex) {
      const regex = new RegExp(val.regex);
      isMatch = regex.test(target);
    }
    if (isMatch) {
      return { location: `header.${key}`, matched_on: val };
    }
  }
  return null;
}


const match = ({ rule, response }) => {
  const allMatches = [];
  const matchDetails = [];

  const matchRule = rule.match_on;

  if (!matchRule) return { match: false };

  if (matchRule.status) {
    const statusMatchResult = statusMatch(response.status, matchRule.status);
    if (statusMatchResult) {
      allMatches.push(true);
      matchDetails.push(statusMatchResult);
    } else {
      allMatches.push(false);
    }
  }

  if (response?.body && matchRule.body) {
    const bodyMatchResult = bodyMatch(response.body, matchRule.body);
    if (bodyMatchResult) {
      allMatches.push(true);
      matchDetails.push(bodyMatchResult);
    } else {
      allMatches.push(false);
    }
  }

  if (response?.headers && matchRule.header) {
    const headerMatchResult = headerMatch(response.headers, matchRule.header);
    if (headerMatchResult) {
      allMatches.push(true);
      matchDetails.push(headerMatchResult);
    } else {
      allMatches.push(false);
    }
  }

  console.log("all matches: ", allMatches)

  const isMatch = allMatches.length > 0 && allMatches.every(m => m);

  console.log("final match: ", isMatch);

  return { match: isMatch, details: matchDetails }
}

const matcher = { match };

export { matcher };
