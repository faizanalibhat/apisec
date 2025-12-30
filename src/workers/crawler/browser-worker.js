import { chromium } from 'playwright';
import vm from "vm";
import fs from "fs/promises";
import { crawlAndCapture } from './crawler.js';



export async function browserWorker(payload, msg, channel) {
  let browser;

  try {
    const { project, scan } = payload;

    console.log("[+] BROWSER SCAN LAUNCHED : ", project, scan);

    const { target_url, scope } = project?.configuration || {};

    const auth_script = project?.authScript;

    if (!auth_script) {
      throw Error("Auth Script not provided");
    }

    const auth_script_content = await fs.readFile(auth_script?.path, "utf-8");

    browser = await chromium.launch({
      headless: true, args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    const exports = {};
    const sandbox = {
      target_url: target_url,
      scope: scope,
      page: page,
      browser: null,
      context: null,
      console: console, // Added console for debugging in scripts
      exports: exports,
      module: { exports: exports }
    }

    vm.createContext(sandbox);
    vm.runInContext(auth_script_content, sandbox);

    // auth function from user
    const authenticate = sandbox.module.exports.authenticate || sandbox.exports.authenticate || sandbox.authenticate;

    if (typeof authenticate !== 'function') {
      throw Error("Auth script must provide an 'authenticate' function");
    }

    await authenticate({ page, target_url, scope });

    // extract auth context
    const authContext = await extractAuthContext(page);


    console.log("Auth Context: ", authContext);

    const capturedRequests = await crawlAndCapture({
      page,
      target_url,
      scope
    });

    console.log("[+] capturedRequests ", capturedRequests);
  }
  catch (err) {
    console.log(err);
  }
  finally {
    channel.ack(msg);
    if (browser) {
      await browser.close();
    }
  }
}

async function extractAuthContext(page) {
  const context = page.context();

  // Cookies (if backend sets any)
  const cookies = await context.cookies();

  // Storage
  const storage = await page.evaluate(() => {
    const local = {};
    const session = {};

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      local[k] = localStorage.getItem(k);
    }

    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      session[k] = sessionStorage.getItem(k);
    }

    return {
      localStorage: local,
      sessionStorage: session
    };
  });

  const headers = {};

  if (storage.localStorage.token) {
    headers.authorization = `Bearer ${storage.localStorage.token}`;
  }

  return {
    origin: new URL(page.url()).origin,
    cookies,
    headers,
    storage,
    authenticatedAt: new Date().toISOString()
  };
}
