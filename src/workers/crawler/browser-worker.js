import { chromium } from 'playwright';
import Scan from '../../models/scan.model.js';
import Vuln from '../../models/vulnerability.model.js';
import RawRequest from '../../models/rawRequest.model.js';
import vm from "vm";
import fs from "fs/promises";
import { crawlAndCapture } from './crawler.js';
import { CrawlerAuthContext } from '../../models/crawler-auth-context.model.js';


export async function browserWorker(payload, msg, channel) {
  let browser;
  const { project, scan } = payload;

  const orgId = project.orgId;

  const { configuration } = project;

  // if collection id & environment is set, send to scanflow.collection
  if (configuration?.collection_id && configuration?.environment_id) {
      await mqbroker.publish("apisec", "apisec.scanflow.collection", { project, scan });
      return;
  }
  
  try {

    console.log("[+] BROWSER SCAN LAUNCHED : ", scan?.name);

    const { target_url, scope, exclude_scope } = project?.configuration || {};

    const auth_script = project?.authScript;
    let auth_script_content = "";

    if (auth_script) {
      auth_script_content = await fs.readFile(auth_script?.path, "utf-8");
    }


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

    if (auth_script_content) {
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
    }



    // save the auth context inside mongodb for this scan.
    // await CrawlerAuthContext.create({
    //   scanId: scan._id,
    //   orgId: project.orgId,
    //   ...authContext
    // });

    // console.log("Auth Context: ", authContext);

    // set scan to running
    await Scan.updateOne({ _id: scan._id }, { status: 'running' });

    await crawlAndCapture({
      page,
      context: { project, scan },
      target_url,
      scope,
      exclude_scope
    });

    // total requests
    const totalRequests = await RawRequest.countDocuments({ scanId: scan._id });

    // count total vulns
    // const totalVulns = await Vuln.countDocuments({ scanId: scan._id });
    const [totalVulns, totalCritical, totalHigh, totalMedium, totalLow] = await Promise.all([
      Vuln.countDocuments({ orgId, scanId: scan._id }),
      Vuln.countDocuments({ orgId, scanId: scan._id, severity: 'critical' }),
      Vuln.countDocuments({ orgId, scanId: scan._id, severity: 'high' }),
      Vuln.countDocuments({ orgId, scanId: scan._id, severity: 'medium' }),
      Vuln.countDocuments({ orgId, scanId: scan._id, severity: 'low' })
    ]);

    // set scan to completed
    await Scan.updateOne({ orgId, _id: scan._id }, { $set: { status: 'completed' }, $inc: { 'metrics.total_requests': totalRequests, 'metrics.total_vulns': totalVulns, 'metrics.total_critical': totalCritical, 'metrics.total_high': totalHigh, 'metrics.total_medium': totalMedium, 'metrics.total_low': totalLow } });

    // console.log("[+] capturedRequests ", capturedRequests);
  }
  catch (err) {
    console.log(err);
    await Scan.updateOne({ _id: scan._id }, { status: 'failed' });
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
