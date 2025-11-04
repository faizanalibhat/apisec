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
  let highlight = null;
  if (typeof match == 'number') {
    isMatch = status == match;
    if (isMatch) highlight = `/${match}/`;
  }
  else if (Array.isArray(match)) {
    isMatch = match.includes(status);
    if (isMatch) highlight = `/${status}/`;
  }
  else if (typeof match == 'object') {
    if (match.in && Array.isArray(match.in)) {
      isMatch = match.in.includes(status);
      if (isMatch) highlight = `/${status}/`;
    }
    else if (match.notIn && Array.isArray(match.notIn)) {
      isMatch = !match.notIn.includes(status);
      // No highlight for notIn
    }
  }

  if (isMatch) {
    return { location: 'status', matched_on: status, highlight };
  }
  return null;
}

function bodyMatch(body, match) {
  let isMatch = false;
  let highlight = null;
  if (match.contains) {
    isMatch = contains(JSON.stringify(body), match.contains);
    if (isMatch) {
        const pattern = Array.isArray(match.contains) ? match.contains.map(escapeRegex).join('|') : escapeRegex(match.contains);
        highlight = `/${pattern}/gi`;
    }
  }

  if (match.regex) {
    const regex = new RegExp(match.regex);
    isMatch = regex.test(JSON.stringify(body));
    if (isMatch) highlight = `/${match.regex}/gi`;
  }

  if (isMatch) {
    return { location: 'body', matched_on: match, highlight };
  }
  return null;
}

function headerMatch(header, match) {
    const results = [];
    for (const [key, val] of Object.entries(match)) {
        let isMatch = false;
        let highlight = null;
        const target = header[key?.toLowerCase?.()];

        if (!target) continue;

        if (typeof val === 'string') {
            isMatch = target === val;
            if (isMatch) highlight = `/${escapeRegex(val)}/gi`;
        } else if (val.contains) {
            isMatch = contains(target, val.contains);
            if (isMatch) {
                const pattern = Array.isArray(val.contains) ? val.contains.map(escapeRegex).join('|') : escapeRegex(val.contains);
                highlight = `/${pattern}/gi`;
            }
        } else if (val.regex) {
            const regex = new RegExp(val.regex);
            isMatch = regex.test(target);
            if (isMatch) highlight = `/${val.regex}/gi`;
        }

        if (isMatch) {
            results.push({ location: `header.${key}`, matched_on: val, highlight });
        }
    }
    return results;
}


const match = ({ rule, response }) => {
  const allMatches = [];
  const matchDetails = [];
  const highlights = {};

  const matchRule = rule.match_on;

  if (!matchRule) return { match: false, details: [], highlight: {} };

  if (matchRule.status) {
    const statusMatchResult = statusMatch(response.status, matchRule.status);
    if (statusMatchResult) {
      allMatches.push(true);
      matchDetails.push(statusMatchResult);
      if (statusMatchResult.highlight) highlights.status = statusMatchResult.highlight;
    } else {
      allMatches.push(false);
    }
  }

  if (response?.body && matchRule.body) {
    const bodyMatchResult = bodyMatch(response.body, matchRule.body);
    if (bodyMatchResult) {
      allMatches.push(true);
      matchDetails.push(bodyMatchResult);
      if (bodyMatchResult.highlight) highlights.body = bodyMatchResult.highlight;
    } else {
      allMatches.push(false);
    }
  }

  if (response?.headers && matchRule.header) {
    const headerMatchResults = headerMatch(response.headers, matchRule.header);
    if (headerMatchResults.length > 0) {
        highlights.header = {};
        for (const result of headerMatchResults) {
            allMatches.push(true);
            matchDetails.push(result);
            if (result.highlight) {
                const key = result.location.split('.')[1];
                highlights.header[key] = result.highlight;
            }
        }
    } else {
        if (Object.keys(matchRule.header).length > 0) {
             allMatches.push(false);
        }
    }
  }

  const isMatch = allMatches.length > 0 && allMatches.every(m => m);

  return { match: isMatch, details: matchDetails, highlight: highlights }
}

const matcher = { match };

export { matcher };
