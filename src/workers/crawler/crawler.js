import { canonicalizeRequest } from './canonicalize-requests.js';
import RawRequest from '../../models/rawRequest.model.js';
import { mqbroker } from "../../services/rabbitmq.service.js";


export async function crawlAndCapture({
  page,
  target_url,
  scope,
  exclude_scope,
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

  const normalizedExcludeScope = (exclude_scope || []).map(s => {
    if (s.type === 'url') {
      try {
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

    if (!isInScope(url, normalizedScope, normalizedExcludeScope)) {
      return route.abort();
    }

    return route.continue();
  });

  // Handle new tabs/pages opened by clicks
  page.context().on('page', async (newPage) => {
    try {
      await newPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
      const newUrl = canonicalizeUrl(newPage.url());
      if (isInScope(newUrl, normalizedScope, normalizedExcludeScope) && !discoveredUrls.has(newUrl)) {
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

    await mqbroker.publish('apisec', "apisec.scanflow.initiate", { request, ...context });
  });

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

      // Extract URLs from text/HTML content
      const textUrls = await extractUrlsFromText(page, normalizedScope, normalizedExcludeScope);
      for (const tUrl of textUrls) {
        if (!discoveredUrls.has(tUrl)) {
          discoveredUrls.add(tUrl);
          queue.push(tUrl);
          console.log(`[CRAWLER][${url}] + Discovered from content: ${tUrl}`);
        }
      }
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

      const clickables = await getInScopeClickables(page, normalizedScope, normalizedExcludeScope);
      let clickedAny = false;

      for (const el of clickables) {
        // CRITICAL: Ensure we are still on the correct page before interacting
        const nowUrl = canonicalizeUrl(page.url());
        if (nowUrl !== url) {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => { });
        }

        const signature = await getElementSignature(el, page.url());
        if (!signature || clickedSignatures.has(signature)) continue;

        clickedSignatures.add(signature);
        clickedAny = true;

        try {
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

          // If we navigated away, record it
          if (isInScope(postClickUrl, normalizedScope, normalizedExcludeScope) && !discoveredUrls.has(postClickUrl)) {
            discoveredUrls.add(postClickUrl);
            queue.push(postClickUrl);
          }

          if (postClickUrl !== currentUrl) {
            // If we navigated to a new URL that is in scope, let it settle for a moment
            // to capture any initial requests (XHR/Fetch)
            if (isInScope(postClickUrl, normalizedScope, normalizedExcludeScope)) {
              await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });
            }

            // Extract URLs from content after navigation/interaction
            const postClickTextUrls = await extractUrlsFromText(page, normalizedScope, normalizedExcludeScope);
            for (const tUrl of postClickTextUrls) {
              if (!discoveredUrls.has(tUrl)) {
                discoveredUrls.add(tUrl);
                queue.push(tUrl);
                console.log(`[CRAWLER][${url}] + Discovered from content after interaction: ${tUrl}`);
              }
            }

            // If we are not on the original URL anymore, go back to finish the scan
            if (postClickUrl !== url) {
              await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => { });
            }
          } else {
            // Even if URL didn't change, content might have. Extract URLs again.
            const postClickTextUrls = await extractUrlsFromText(page, normalizedScope, normalizedExcludeScope);
            for (const tUrl of postClickTextUrls) {
              if (!discoveredUrls.has(tUrl)) {
                discoveredUrls.add(tUrl);
                queue.push(tUrl);
                console.log(`[CRAWLER][${url}] + Discovered from content after interaction: ${tUrl}`);
              }
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


async function safeGoto(page, url, scope, excludeScope, visitedUrls) {
  if (!isInScope(url, scope, excludeScope)) return;
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


async function getInScopeClickables(page, scope, excludeScope) {
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

      const logoutKeywords = ['logout', 'log-out', 'signout', 'sign-out', 'expire', 'terminate', 'exit'];
      const isLogoutElement = (el) => {
        const text = (el.innerText || el.value || "").toLowerCase();
        const id = (el.id || "").toLowerCase();
        const className = (typeof el.className === 'string' ? el.className : "").toLowerCase();
        const name = (el.name || "").toLowerCase();
        const ariaLabel = (el.getAttribute('aria-label') || "").toLowerCase();

        return logoutKeywords.some(kw =>
          text.includes(kw) ||
          id.includes(kw) ||
          className.includes(kw) ||
          name.includes(kw) ||
          ariaLabel.includes(kw)
        );
      };

      for (const el of all) {
        if (!isVisible(el)) continue;
        if (isLogoutElement(el)) continue;

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
            if (el.children.length < 10) isClickable = true;
          }
          // Also check if it's an input with a URL-like value that might be clickable/interactive
          if (tagName === 'INPUT' && /https?:\/\//.test(el.value || '')) {
            isClickable = true;
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
          try {
            const resolved = new URL(rawHref, page.url()).href;
            if (!isInScope(resolved, scope, excludeScope)) continue;
          } catch {
            continue;
          }
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
    const inputs = await page.$$('input:not([type="submit"]):not([type="button"]):not([type="hidden"]), select, textarea');
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
      const name = node.getAttribute('name') || '';

      // Get a simple path to the element to make it more unique
      let path = '';
      let current = node;
      try {
        for (let i = 0; i < 5 && current && current !== document.body; i++) {
          const index = current.parentNode ? Array.from(current.parentNode.children).indexOf(current) : 0;
          path = `${current.tagName}[${index}]>${path}`;
          current = current.parentNode;
        }
      } catch (e) { /* ignore */ }

      if (href) {
        try {
          const resolved = new URL(href, url).href;
          return `HREF:${resolved}`;
        } catch {
          return `HREF:${href}`;
        }
      }

      return `${url}|${path}|${tag}|${text}|${id}|${className}|${role}|${name}`;
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


function isInScope(url, scope, excludeScope) {
  try {
    const u = canonicalizeUrl(url);

    // Check exclude scope first
    if (excludeScope && excludeScope.length > 0) {
      const isExcluded = excludeScope.some(s => {
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
      if (isExcluded) return false;
    }

    if (!scope || !scope.length) return true;

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

async function extractUrlsFromText(page, scope, excludeScope) {
  try {
    // Extract URLs from HTML, attributes, and properties
    const discoveredUrls = await page.evaluate(() => {
      const urls = new Set();
      const urlRegex = /https?:\/\/[^\s"'<>()[\]{}|\\^`]+[^\s"'<>()[\]{}|\\^`.,!?;:]/g;

      // 1. Check the entire HTML content
      const content = document.documentElement.outerHTML;
      const matches = content.match(urlRegex);
      if (matches) matches.forEach(m => urls.add(m));

      // 2. Check all attributes of all elements (handles data-*, value, etc.)
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        if (el.attributes) {
          for (const attr of el.attributes) {
            const m = attr.value.match(urlRegex);
            if (m) m.forEach(url => urls.add(url));
          }
        }
        // 3. Check value property (handles dynamic input values)
        if (el.value && typeof el.value === 'string') {
          const m = el.value.match(urlRegex);
          if (m) m.forEach(url => urls.add(url));
        }
      }
      return Array.from(urls);
    });

    const inScope = new Set();
    for (const url of discoveredUrls) {
      try {
        const canon = canonicalizeUrl(url);
        if (isInScope(canon, scope, excludeScope)) {
          inScope.add(canon);
        }
      } catch { /* ignore */ }
    }
    return Array.from(inScope);
  } catch (e) {
    console.error("[-] Error extracting URLs from text: ", e.message);
    return [];
  }
}
