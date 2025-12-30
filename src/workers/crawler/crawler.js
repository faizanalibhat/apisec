import { canonicalizeRequest } from './canonicalize-requests.js';

export async function crawlAndCapture({
  page,
  target_url,
  scope,
  maxClicks = 200
}) {
  const requests = new Map();
  const visitedUrls = new Set();

  /**
   * 1️⃣ Network-level scope enforcement
   */
  await page.route('**/*', route => {
    const url = route.request().url();

    if (!isInScope(url, scope)) {
      return route.abort();
    }

    return route.continue();
  });

  /**
   * 2️⃣ Capture requests (only in-scope will reach here)
   */
  page.on('request', req => {
    if (!['xhr', 'fetch'].includes(req.resourceType())) return;

    const canon = canonicalizeRequest(req);
    requests.set(canon.signature, canon);
  });

  /**
   * 3️⃣ Initial navigation
   */
  await safeGoto(page, target_url, scope, visitedUrls);

  /**
   * 4️⃣ Controlled crawling loop
   */
  let clicks = 0;

  while (clicks < maxClicks) {
    const clickables = await getInScopeClickables(page, scope);

    if (!clickables.length) break;

    for (const el of clickables) {
      if (clicks >= maxClicks) break;

      try {
        await el.click({ timeout: 2000, trial: true });
        await el.click({ timeout: 2000 });

        clicks++;

        await page.waitForTimeout(400);
        await captureSpaNavigation(page, visitedUrls);

      } catch {
        /* ignore */
      }
    }
  }

  return Array.from(requests.values());
}



async function captureSpaNavigation(page, visitedUrls) {
  const currentUrl = page.url();
  if (!visitedUrls.has(currentUrl)) {
    visitedUrls.add(currentUrl);
  }
}


async function getInScopeClickables(page, scope) {
  const elements = await page.$$('a, button, [role="button"], [onclick]');
  const inScope = [];

  for (const el of elements) {
    try {
      const href = await el.getAttribute('href');

      if (href) {
        const resolved = new URL(href, page.url()).href;
        if (!isInScope(resolved, scope)) continue;
      }

      inScope.push(el);
    } catch {
      /* ignore */
    }
  }

  return inScope;
}


function isInScope(url, scope) {
  try {
    const u = new URL(url);
    return scope.some(s => u.href.startsWith(s));
  } catch {
    return false;
  }
}
