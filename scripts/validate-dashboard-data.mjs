import { readFileSync } from "node:fs";
import { join } from "node:path";

const site = new URL("../", import.meta.url).pathname;
const data = JSON.parse(readFileSync(join(site, "data", "dashboard.json"), "utf8"));

const errors = [];
const warnings = [];

function requireField(item, field, context) {
  if (item[field] === undefined || item[field] === null || item[field] === "") {
    errors.push(`${context}: missing ${field}`);
  }
}

function findEvent(id) {
  const event = data.events.find((item) => item.id === id);
  if (!event) errors.push(`events: missing required event ${id}`);
  return event;
}

for (const event of data.events) {
  const context = `event ${event.id ?? "(missing id)"}`;
  for (const field of ["id", "title", "startDate", "endDate", "location", "format", "category", "priority", "fit", "sourceName", "sourceUrl", "status", "notes"]) {
    requireField(event, field, context);
  }
  for (const field of ["checkedAt", "sourceType", "summary"]) {
    requireField(event.verification ?? {}, field, `${context} verification`);
  }
  if (event.verification?.sourceType !== "official organizer source") {
    errors.push(`${context}: sourceType must be official organizer source`);
  }

  if (event.startDate === "2026-12-31" || event.format === "rolling" || event.region?.includes("Fund-hosted")) {
    errors.push(`${context}: watch pages must not be represented as dated events`);
  }

  if (/research\s*fora/i.test(`${event.title} ${event.sourceName} ${event.sourceUrl}`)) {
    errors.push(`${context}: generic ResearchFora listing is not allowed as a trusted event source`);
  }

  if (/online access listed|hybrid \/ online/i.test(`${event.format} ${event.notes}`)) {
    errors.push(`${context}: virtual access must be verified, not inferred from aggregator metadata`);
  }

  if (/far/i.test(event.region ?? "") && !/watch|content|live|record/i.test(`${event.status} ${event.notes}`)) {
    warnings.push(`${context}: far travel event should explain virtual/content watch or travel condition`);
  }
}

for (const source of data.watchSources ?? []) {
  const context = `watch source ${source.id ?? "(missing id)"}`;
  for (const field of ["id", "company", "title", "sourceUrl", "type", "cadence", "eligibility", "priority", "notes"]) {
    requireField(source, field, context);
  }
  for (const field of ["checkedAt", "sourceType", "summary"]) {
    requireField(source.verification ?? {}, field, `${context} verification`);
  }
  if (source.type !== "watch page") {
    errors.push(`${context}: type must be "watch page"`);
  }
  if (source.verification?.sourceType !== "official company page") {
    errors.push(`${context}: sourceType must be official company page`);
  }
  if (/weekly/i.test(source.cadence)) {
    warnings.push(`${context}: weekly checks are probably too frequent for student/program pages`);
  }
}

const globalAi = findEvent("global-ai-finance-research-2026");
if (globalAi && !/Aug 31/i.test(globalAi.notes)) {
  errors.push("global-ai-finance-research-2026: missing Aug 31 paper deadline");
}

const kbw = findEvent("kbw-2026");
if (kbw && !/Upbit Institutional Summit/i.test(`${kbw.location} ${kbw.notes}`)) {
  errors.push("kbw-2026: missing Upbit Institutional Summit split");
}

const sff = findEvent("singapore-fintech-festival-2026");
if (sff && (!/Singapore EXPO/i.test(sff.location) || !/Nov 18-20|18-20/i.test(sff.notes))) {
  errors.push("singapore-fintech-festival-2026: missing official Nov 18-20 Singapore EXPO details");
}

const bitcoinKorea = findEvent("bitcoin-korea-conference-2026");
if (bitcoinKorea && /hybrid|online/i.test(bitcoinKorea.format)) {
  errors.push("bitcoin-korea-conference-2026: must not be marked hybrid/online without official livestream confirmation");
}

const focusRanks = data.events
  .filter((event) => event.focusRank && event.focusRank <= 6)
  .map((event) => event.focusRank)
  .sort((a, b) => a - b);
if (focusRanks.join(",") !== "1,2,3,4,5,6") {
  errors.push(`focus ranks must be exactly 1..6; got ${focusRanks.join(",")}`);
}

if (warnings.length) {
  console.warn(warnings.map((warning) => `WARN ${warning}`).join("\n"));
}

if (errors.length) {
  console.error(errors.map((error) => `ERROR ${error}`).join("\n"));
  process.exit(1);
}

console.log("Dashboard data validation passed");
