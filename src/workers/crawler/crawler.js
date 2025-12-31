import { canonicalizeRequest } from './canonicalize-requests.js';
import RawRequest from '../../models/rawRequest.model.js';
import { mqbroker } from "../../services/rabbitmq.service.js";


export async function crawlAndCapture({
  page,
  target_url,
  scope,
  context
}) {
  const exploredUrls = new Set();
  const clickedSignatures = new Set();
  const canonicalTarget = canonicalizeUrl(target_url);
  const discoveredUrls = new Set([canonicalTarget]);
  const queue = [canonicalTarget];
  const visitedUrls = new Set();

  const normalizedScope = (scope || []).map(s => {
    if (s.type === 'url') {
      try {
        // Use target_url as base for relative paths, then canonicalize
        const absolute = new URL(s.value, target_url).href;
        return { ...s, value: canonicalizeUrl(absolute) };
      } catch {
        return s;
      }
    }
    return s;
  });

  // Always include target_url in scope
  if (!normalizedScope.some(s => s.type === 'url' && canonicalTarget.startsWith(s.value))) {
    normalizedScope.push({ type: 'url', value: canonicalTarget });
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

  // Handle new tabs/pages opened by clicks
  page.context().on('page', async (newPage) => {
    try {
      await newPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
      const newUrl = canonicalizeUrl(newPage.url());
      if (isInScope(newUrl, normalizedScope) && !discoveredUrls.has(newUrl)) {
        console.log(`[CRAWLER][${newUrl}] + Found new page in new tab: ${newUrl}`);
        discoveredUrls.add(newUrl);
        queue.push(newUrl);
      }
      await newPage.close();
    } catch {
      /* ignore */
    }
  });

  page.on('request', async (req) => {
    // if (!['xhr', 'fetch'].includes(req.resourceType())) return;

    const canon = canonicalizeRequest(req);
    canon.orgId = context?.project?.orgId;

    // console.log("[+] CREATED REQUEST: ", canon);

    const exists = await RawRequest.findOne({
      method: canon.method,
      url: canon.url,
      source: canon.source,
      orgId: canon.orgId
    });

    if (exists) return;

    const request = await RawRequest.findOneAndUpdate(
      {
        method: canon.method,
        url: canon.url,
        source: canon.source,
        orgId: canon.orgId
      },
      {
        $set: canon,
        $addToSet: { projectIds: context?.project?._id }
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
   * 4️⃣ Crawling loop
   */
  while (queue.length > 0) {
    const rawUrl = queue.shift();
    const url = canonicalizeUrl(rawUrl);

    if (exploredUrls.has(url)) {
      console.log(`[CRAWLER][${url}] Already explored, skipping.`);
      continue;
    }

    console.log(`\n[CRAWLER][${url}] >>> Exploring: ${url}`);

    try {
      if (canonicalizeUrl(page.url()) !== url) {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      }
      visitedUrls.add(url);
    } catch (e) {
      console.log(`[CRAWLER][${url}] !!! Failed to navigate: ${e.message}`);
      exploredUrls.add(url);
      continue;
    }

    let hasNewItems = true;
    while (hasNewItems) {
      const currentUrl = canonicalizeUrl(page.url());

      // If we've navigated to a DIFFERENT page that is already fully explored, stop here
      if (exploredUrls.has(currentUrl) && currentUrl !== url) {
        console.log(`[CRAWLER][${currentUrl}] Navigated to explored page, returning to ${url}`);
        break;
      }

      const clickables = await getInScopeClickables(page, normalizedScope);
      if (clickables.length > 0) {
        console.log(`[CRAWLER][${currentUrl}] Found ${clickables.length} interactive elements`);
      }
      let clickedAny = false;

      for (const el of clickables) {
        // CRITICAL: Ensure we are still on the correct page before interacting
        const nowUrl = canonicalizeUrl(page.url());
        if (nowUrl !== url) {
          console.log(`[CRAWLER][${nowUrl}] Off-track, returning to ${url} before next interaction`);
          await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => { });
        }

        const signature = await getElementSignature(el, page.url());
        if (!signature || clickedSignatures.has(signature)) continue;

        clickedSignatures.add(signature);
        clickedAny = true;

        try {
          const elInfo = await el.evaluate(node => ({
            tag: node.tagName,
            text: (node.innerText || node.value || "").trim().substring(0, 30),
            type: node.type || ""
          }));

          console.log(`[CRAWLER][${currentUrl}] Interacting with [${elInfo.tag}] "${elInfo.text}"`);

          // Fill all visible inputs on the page before clicking
          await fillAllVisibleInputs(page);

          // Perform the click
          await el.click({ timeout: 5000, trial: true });
          await el.click({ timeout: 5000 });

          // Wait for potential DOM changes/animations/redirections
          // We wait for either a URL change or a short timeout
          await page.waitForTimeout(1500);
          await captureSpaNavigation(page, visitedUrls);

          const postClickUrl = canonicalizeUrl(page.url());

          if (postClickUrl !== currentUrl) {
            console.log(`[CRAWLER][${currentUrl}] Navigated to ${postClickUrl}`);
          }

          // If we navigated away, record it
          if (isInScope(postClickUrl, normalizedScope) && !discoveredUrls.has(postClickUrl)) {
            console.log(`[CRAWLER][${postClickUrl}] + Found new page: ${postClickUrl}`);
            discoveredUrls.add(postClickUrl);
            queue.push(postClickUrl);
          }

          if (postClickUrl !== currentUrl) {
            // If we navigated to a new URL that is in scope, let it settle for a moment
            // to capture any initial requests (XHR/Fetch)
            if (isInScope(postClickUrl, normalizedScope)) {
              await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });
            }

            // If we are not on the original URL anymore, go back to finish the scan
            if (postClickUrl !== url) {
              console.log(`[CRAWLER][${postClickUrl}] Returning to ${url} to finish remaining elements...`);
              await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => { });
            }
          }

          break; // Re-scan DOM after interaction
        } catch {
          continue;
        }
      }

      if (!clickedAny) {
        hasNewItems = false;
      }
    }

    exploredUrls.add(url);

    // Sync queue with newly discovered visitedUrls
    for (const vUrl of visitedUrls) {
      if (!discoveredUrls.has(vUrl)) {
        discoveredUrls.add(vUrl);
        queue.push(vUrl);
      }
    }
  }

  console.log("[CRAWLER] SCAN COMPLETED >>> Explored: ", exploredUrls.size);
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
  try {
    // Use a script to find all potentially clickable elements, including those with JS handlers
    const clickableSelectors = await page.evaluate(() => {
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          el.offsetWidth > 0 &&
          el.offsetHeight > 0;
      };

      const tags = ['A', 'BUTTON', 'DETAILS', 'SUMMARY'];
      const roles = ['button', 'link', 'menuitem', 'option', 'tab', 'checkbox', 'radio', 'switch'];

      const all = document.querySelectorAll('a, button, input, select, textarea, [role], [onclick], div, span, li, svg');
      const foundIds = [];

      for (const el of all) {
        if (!isVisible(el)) continue;

        let isClickable = false;
        const tagName = el.tagName;

        if (tags.includes(tagName)) {
          isClickable = true;
        } else if (tagName === 'INPUT' && (el.type === 'submit' || el.type === 'button')) {
          isClickable = true;
        } else if (roles.includes(el.getAttribute('role'))) {
          isClickable = true;
        } else if (el.hasAttribute('onclick')) {
          isClickable = true;
        } else {
          // Heuristic for React/SPA: cursor pointer usually means a JS handler is attached
          const style = window.getComputedStyle(el);
          if (style.cursor === 'pointer') {
            // Avoid large containers that just inherit pointer; check if it's a leaf-ish node
            if (el.children.length < 5) isClickable = true;
          }
        }

        if (isClickable) {
          // Mark element so we can find it with Playwright
          const id = 'crawl-' + Math.random().toString(36).substr(2, 9);
          el.setAttribute('data-crawl-id', id);
          foundIds.push(id);
        }
      }
      return foundIds;
    });

    const inScope = [];
    for (const id of clickableSelectors) {
      try {
        const selector = `[data-crawl-id="${id}"]`;
        const el = await page.$(selector);
        if (!el) continue;

        // Clean up the attribute
        await el.evaluate(node => node.removeAttribute('data-crawl-id'));

        const rawHref = await el.getAttribute('href');
        if (rawHref) {
          const resolved = new URL(rawHref, page.url()).href;
          if (!isInScope(resolved, scope)) continue;
        }

        inScope.push(el);
      } catch {
        /* ignore */
      }
    }

    return inScope;
  } catch (e) {
    console.error("[-] Error finding clickables: ", e.message);
    return [];
  }
}


async function fillAllVisibleInputs(page) {
  try {
    const currentUrl = page.url();
    const inputs = await page.$$('input:not([type="submit"]):not([type="button"]):not([type="hidden"]), select, textarea');
    if (inputs.length > 0) {
      console.log(`[CRAWLER][${currentUrl}] Filling ${inputs.length} visible inputs...`);
    }
    for (const input of inputs) {
      try {
        const isVisible = await input.isVisible();
        if (isVisible) {
          await fillSingleInput(input);
        }
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    /* ignore */
  }
}

async function fillSingleInput(input) {
  try {
    const info = await input.evaluate(el => {
      return {
        tagName: el.tagName,
        type: el.type,
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
        role: el.getAttribute('role')
      };
    });

    if (info.tagName === 'SELECT') {
      const options = await input.$$('option');
      if (options.length > 1) {
        await input.selectOption({ index: 1 });
      }
    } else if (info.type === 'checkbox' || info.type === 'radio' || info.role === 'switch') {
      const isChecked = await input.isChecked();
      if (!isChecked) await input.check();
    } else if (['text', 'email', 'password', 'tel', 'url', 'number', 'search'].includes(info.type) || info.tagName === 'TEXTAREA') {
      let value = "test_data";
      if (info.type === 'email') value = "test@example.com";
      if (info.type === 'number') value = "123";
      if (info.type === 'tel') value = "1234567890";
      if (info.type === 'url') value = "https://example.com";

      await input.fill(value);
    }
  } catch (e) {
    /* ignore */
  }
}


async function getElementSignature(el, currentUrl) {
  try {
    const canonical = canonicalizeUrl(currentUrl);
    return await el.evaluate((node, url) => {
      const tag = node.tagName;
      const text = (node.innerText || node.value || "").trim().substring(0, 50);
      const href = node.getAttribute('href');
      const id = node.id || '';
      const className = node.className || '';
      const role = node.getAttribute('role') || '';

      if (href) {
        try {
          const resolved = new URL(href, url).href;
          // We don't canonicalize here to keep hrefs precise, 
          // but the base URL is already canonicalized.
          return resolved;
        } catch {
          return href;
        }
      }

      return `${url}|${tag}|${text}|${id}|${className}|${role}`;
    }, canonical);
  } catch {
    return null;
  }
}


function canonicalizeUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    // Keep hash routes (e.g. /#/dashboard), remove anchors (e.g. #how-it-works)
    u.hash = u.hash && u.hash.includes('/') ? u.hash : '';

    // Remove empty query
    if (u.search === '?') u.search = '';

    // Remove trailing slash from pathname
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    u.pathname = path;

    // Return consistent format
    return u.origin + u.pathname + u.search + u.hash;
  } catch {
    return urlStr;
  }
}


function isInScope(url, scope) {
  if (!scope || !scope.length) return true;

  try {
    const u = canonicalizeUrl(url);
    return scope.some(s => {
      if (s.type === 'url') {
        // Scope values are already canonicalized in normalizedScope
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
