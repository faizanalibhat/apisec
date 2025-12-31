import { canonicalizeRequest } from './canonicalize-requests.js';
import RawRequest from '../../models/rawRequest.model.js';
import { mqbroker } from "../../services/rabbitmq.service.js";


export async function crawlAndCapture({
  page,
  target_url,
  scope,
  context
}) {
  const visitedUrls = new Set();
  const exploredUrls = new Set();
  const clickedSignatures = new Set();
  const discoveredUrls = new Set([target_url]);
  const queue = [target_url];

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
    const url = queue.shift();
    if (exploredUrls.has(url)) continue;

    console.log(`\n[CRAWLER] >>> Exploring: ${url}`);

    try {
      if (page.url() !== url) {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      }
      visitedUrls.add(url);
    } catch (e) {
      console.log(`[CRAWLER] !!! Failed to navigate to ${url}: ${e.message}`);
      exploredUrls.add(url);
      continue;
    }

    let hasNewItems = true;
    while (hasNewItems) {
      const clickables = await getInScopeClickables(page, normalizedScope);
      console.log(`[CRAWLER] Found ${clickables.length} interactive elements on current view`);
      let clickedAny = false;

      for (const el of clickables) {
        const signature = await getElementSignature(el, page.url());
        if (!signature || clickedSignatures.has(signature)) continue;

        clickedSignatures.add(signature);
        clickedAny = true;

        try {
          const href = await el.getAttribute('href');
          if (href) {
            const resolved = new URL(href, page.url()).href;
            if (isInScope(resolved, normalizedScope) && !discoveredUrls.has(resolved)) {
              discoveredUrls.add(resolved);
              queue.push(resolved);
            }
          }

          // Log interaction details cleanly
          const elInfo = await el.evaluate(node => ({
            tag: node.tagName,
            text: (node.innerText || node.value || "").trim().substring(0, 30),
            type: node.type || ""
          }));
          console.log(`[CRAWLER] Interacting with [${elInfo.tag}${elInfo.type ? ':' + elInfo.type : ''}] "${elInfo.text}"`);

          // Fill all visible inputs on the page before clicking to ensure data is present
          await fillAllVisibleInputs(page);

          // Perform the click
          await el.click({ timeout: 3000, trial: true });
          await el.click({ timeout: 3000 });

          // Wait for potential DOM changes/animations
          await page.waitForTimeout(800);
          await captureSpaNavigation(page, visitedUrls);

          const currentUrl = page.url();
          if (isInScope(currentUrl, normalizedScope) && !discoveredUrls.has(currentUrl)) {
            console.log(`[CRAWLER] + Found new page: ${currentUrl}`);
            discoveredUrls.add(currentUrl);
            queue.push(currentUrl);
          }

          break; // Re-scan DOM after interaction to find new elements (e.g. in modals)
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

      const tags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'DETAILS', 'SUMMARY'];
      const roles = ['button', 'link', 'menuitem', 'option', 'tab', 'checkbox', 'radio', 'switch'];

      const all = document.querySelectorAll('a, button, input, select, textarea, [role], [onclick], div, span, li, svg');
      const foundIds = [];

      for (const el of all) {
        if (!isVisible(el)) continue;

        let isClickable = false;
        const tagName = el.tagName;

        if (tags.includes(tagName)) {
          // Exclude hidden inputs or disabled elements
          if (tagName === 'INPUT' && el.type === 'hidden') continue;
          if (el.disabled) continue;
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
  } catch (e) {
    console.error("[-] Error finding clickables: ", e.message);
    return [];
  }
}


async function fillAllVisibleInputs(page) {
  try {
    const inputs = await page.$$('input:not([type="submit"]):not([type="button"]):not([type="hidden"]), select, textarea');
    if (inputs.length > 0) {
      console.log(`[CRAWLER] Filling ${inputs.length} visible inputs...`);
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
    return await el.evaluate((node, url) => {
      const tag = node.tagName;
      const text = (node.innerText || node.value || "").trim().substring(0, 50);
      const href = node.getAttribute('href');
      const id = node.id || '';
      const className = node.className || '';
      const role = node.getAttribute('role') || '';

      if (href) {
        try {
          return new URL(href, url).href;
        } catch {
          return href;
        }
      }

      return `${url}|${tag}|${text}|${id}|${className}|${role}`;
    }, currentUrl);
  } catch {
    return null;
  }
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
