import { canonicalizeRequest } from './canonicalize-requests.js';
import RawRequest from '../../models/rawRequest.model.js';
import { mqbroker } from "../../services/rabbitmq.service.js";


export async function crawlAndCapture({
  page,
  target_url,
  scope,
  maxClicks = 30,
  context
}) {
  const requests = new Map();
  const visitedUrls = new Set();

  const normalizedScope = (scope || []).map(s => {
    if (s.type === 'url') {
      try {
        return { ...s, value: new URL(s.value, target_url).href };
      } catch {
        return s;
      }
    }
    return s;
  });

  // Always include target_url in scope
  if (!normalizedScope.some(s => s.type === 'url' && target_url.startsWith(s.value))) {
    normalizedScope.push({ type: 'url', value: new URL('/', target_url).href });
  }

  await page.route('**/*', route => {
    const url = route.request().url();
    const resourceType = route.request().resourceType();

    if (['stylesheet', 'script', 'image', 'font'].includes(resourceType)) {
      const u = new URL(url);
      const t = new URL(target_url);
      if (u.origin === t.origin) {
        return route.continue();
      }
    }

    if (!isInScope(url, normalizedScope)) {
      return route.abort();
    }

    return route.continue();
  });

  page.on('request', async (req) => {
    // if (!['xhr', 'fetch'].includes(req.resourceType())) return;

    const canon = canonicalizeRequest(req);
    canon.orgId = context?.project?.orgId;

    console.log("[+] CREATED REQUEST: ", canon);

    const request = await RawRequest.findOneAndUpdate(
      {
        method: canon.method,
        url: canon.url,
        source: canon.source,
        orgId: canon.orgId
      },
      {
        $set: canon,
        // $addToSet: { projectIds: context?.project?._id }
      },
      {
        upsert: true,
        new: true
      }
    );

    // flow execute
    await mqbroker.publish('apisec', "apisec.scanflow.initiate", { request, ...context });
  });

  /**
   * 3️⃣ Initial navigation
   */
  await safeGoto(page, target_url, normalizedScope, visitedUrls);

  /**
   * 4️⃣ Controlled crawling loop
   */
  let clicks = 0;

  while (clicks < maxClicks) {
    console.log("[+] VISITED URLS : ", visitedUrls);

    const clickables = await getInScopeClickables(page, normalizedScope);

    console.log("[+] FOUND ", clickables.length, " clickables");

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


async function safeGoto(page, url, scope, visitedUrls) {
  if (!isInScope(url, scope)) return;
  if (visitedUrls.has(url)) return;

  visitedUrls.add(url);
  await page.goto(url, { waitUntil: 'networkidle' });
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
  if (!scope || !scope.length) return true; // Default to in-scope if no scope defined

  try {
    const u = new URL(url).href;
    return scope.some(s => {
      if (s.type === 'url') {
        return u.startsWith(s.value);
      }
      if (s.type === 'regex') {
        try {
          const re = new RegExp(s.value);
          return re.test(u);
        } catch {
          return false;
        }
      }
      return false;
    });
  } catch {
    return false;
  }
}
