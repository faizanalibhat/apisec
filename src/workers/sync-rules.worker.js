import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { exec } from "child_process";
// import '../db/mongoose.js';
import Rules from "../models/rule.model.js"
import { mqbroker } from "../services/rabbitmq.service.js";



const REPO_URL = "https://github.com/Snap-sec/Suite-Yaml-Rule-Guides.git";
const LOCAL_DIR = path.resolve("./src/data/Suite-Yaml-Rule-Guides");
const APIDIR = path.join(LOCAL_DIR, "apisec");




export function cloneOrUpdateRepo(repoUrl = REPO_URL, localPath = LOCAL_DIR) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(localPath)) {
      console.log("📂 Repo exists, pulling latest changes...");
      exec(`git -C "${localPath}" pull`, (err, stdout, stderr) => {
        if (err) return reject(err);
        console.log(stdout || stderr);
        resolve();
      });
    } else {
      console.log("📦 Cloning repository...");
      exec(`git clone ${repoUrl} "${localPath}"`, (err, stdout, stderr) => {
        if (err) return reject(err);
        console.log(stdout || stderr);
        resolve();
      });
    }
  });
}



// Recursively read all YAML files
function getAllYamlFiles(dirPath) {
    let files = [];

    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
        files = files.concat(getAllYamlFiles(fullPath));
        } else if (entry.isFile() && /\.(ya?ml)$/i.test(entry.name)) {
        files.push(fullPath);
        }
    }

    return files;
}



// Parse YAML file into structured object
function parseYamlFile(filePath) {
    const rawYaml = fs.readFileSync(filePath, "utf8");

    try {
        const parsed = yaml.load(rawYaml);
        return {
            rule_name: parsed.rule_name || path.basename(filePath, path.extname(filePath)),
            parsed_yaml: parsed,
            raw_yaml: rawYaml,
            active: false,
        };
    }
    catch(err) {
        console.log(err.message);
        return null;
    }

}



// Import rules into MongoDB and return list
export async function importYamlRules(orgId) {

    const yamlFiles = getAllYamlFiles(APIDIR);
    const rules = yamlFiles.map(parseYamlFile).filter(v => !!v);

    try {

        const bulkOps = rules.map(rule => ({
            updateOne: {
                filter: { orgId, rule_name: rule.rule_name },
                update: { $set: rule },
                upsert: true
            }
        }));


        await Rules.bulkWrite(bulkOps);

        console.log(`✅ Imported ${rules.length} rules into MongoDB.`);
    } catch (err) {
        console.error("❌ MongoDB error:", err);
    } finally {
        await client.close();
    }

    return rules;

}



// Full flow: clone repo + import rules
export async function syncRules(payload, msg, channel) {
    const { orgId } = payload;
    try {
        await cloneOrUpdateRepo();
        const rules = await importYamlRules(orgId);
        return rules;
    }
    catch(err) {
        console.log(err);
    }
    finally {
        channel.ack(msg);
    }
}


export async function syncRulesFromGithub() {

    await mqbroker.consume("apisec", "apisec.rules.sync", syncRules);
}


// Run directly
// if (import.meta.url === `file://${process.argv[1]}`) {
//   syncRules().then((rules) => {
//     console.log(`\n✅ Total Parsed Rules: ${rules.length}`);
//   });
// }
