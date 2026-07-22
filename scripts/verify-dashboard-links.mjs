import { readFileSync } from "node:fs";
import https from "node:https";
import { join } from "node:path";

const site = new URL("../", import.meta.url).pathname;
const data = JSON.parse(readFileSync(join(site, "data", "dashboard.json"), "utf8"));

const targets = [
  ...data.events.map((item) => ({
    type: "event",
    id: item.id,
    title: item.title,
    url: item.sourceUrl,
    required: true
  })),
  ...(data.watchSources ?? []).map((item) => ({
    type: "watch",
    id: item.id,
    title: `${item.company} ${item.title}`,
    url: item.sourceUrl,
    required: false
  }))
];

const failures = [];
const warnings = [];

async function checkLink(target) {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(target.url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": "Mozilla/5.0 Dashboard link verification"
        }
      });
      const line = `${response.status} ${target.type} ${target.id} ${target.url} => ${response.url}`;
      if (response.ok) {
        console.log(`OK ${line}`);
        return;
      }
      lastError = line;
    } catch (error) {
      lastError = `${target.type} ${target.id} ${target.url} ${error.name}:${error.message}`;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await headWithHttps(target.url);
      const line = `${result.status} ${target.type} ${target.id} ${target.url} => ${result.url}`;
      if (result.status >= 200 && result.status < 400) {
        console.log(`OK ${line}`);
        return;
      }
      lastError = line;
    } catch (error) {
      lastError = `${target.type} ${target.id} ${target.url} ${error.name}:${error.message}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }

  if (target.required) {
    failures.push(`BAD ${lastError}`);
  } else {
    warnings.push(`WARN ${lastError}`);
  }
}

function headWithHttps(url) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: "HEAD",
      headers: {
        "user-agent": "Mozilla/5.0 Dashboard link verification"
      }
    }, (response) => {
      response.resume();
      resolve({
        status: response.statusCode ?? 0,
        url: response.headers.location ? new URL(response.headers.location, url).toString() : url
      });
    });
    request.on("error", reject);
    request.setTimeout(20000, () => request.destroy(new Error("timeout")));
    request.end();
  });
}

for (const target of targets) {
  await checkLink(target);
}

if (warnings.length) console.warn(warnings.join("\n"));
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Required dashboard links verified");
