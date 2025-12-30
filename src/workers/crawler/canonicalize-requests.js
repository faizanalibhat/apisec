import crypto from 'crypto';

export function canonicalizeRequest(req) {
  const url = new URL(req.url());

  const canonical = {
    method: req.method(),
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers: filterHeaders(req.headers()),
    body: req.postData(),
  };

  console.log("[+] canonicalizeRequest", canonical);

  canonical.signature = crypto
    .createHash('sha256')
    .update(
      canonical.method +
      canonical.path +
      JSON.stringify(canonical.query) +
      JSON.stringify(canonical.body)
    )
    .digest('hex');

  return canonical;
}

function filterHeaders(headers) {
  const allowed = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!['cookie', 'authorization'].includes(k.toLowerCase())) {
      allowed[k] = v;
    }
  }
  return allowed;
}
