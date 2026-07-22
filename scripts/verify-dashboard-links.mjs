import { readFileSync } from "node:fs";
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
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
    if (target.required) {
      failures.push(`BAD ${line}`);
    } else {
      warnings.push(`WARN ${line}`);
    }
  } catch (error) {
    const line = `${target.type} ${target.id} ${target.url} ${error.name}:${error.message}`;
    if (target.required) {
      failures.push(`BAD ${line}`);
    } else {
      warnings.push(`WARN ${line}`);
    }
  } finally {
    clearTimeout(timer);
  }
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
