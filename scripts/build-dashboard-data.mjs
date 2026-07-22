import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

const root = new URL("../../", import.meta.url).pathname;
const site = new URL("../", import.meta.url).pathname;
const dataDir = join(root, "data");
const outputDir = join(root, "outputs");
const jdDir = join(outputDir, "jd-cache");
const workspace = "/Users/ryan/.openclaw/workspace";
const resumeRoots = [
  join(workspace, "career-vault", "submission-kit"),
  join(workspace, "career-vault", "base-quant"),
  join(workspace, "career-vault", "company-research"),
  join(workspace, "skills", "quant-career-pipeline", "outputs", "company-research"),
  join(workspace, "skills", "obsidian-resume-brain", "outputs")
];

function read(path) {
  return readFileSync(path, "utf8");
}

function stripMarkdown(value) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .trim();
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => stripMarkdown(cell));
}

function parseScore(raw) {
  const match = String(raw).match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function scoreBucket(score) {
  if (score === null) return "unknown";
  if (score >= 4.5) return "elite";
  if (score >= 4.0) return "strong";
  if (score >= 3.5) return "watch";
  return "low";
}

function inferAction(status, score, notes) {
  const text = `${status} ${notes}`.toLowerCase();
  if (text.includes("researched") || text.includes("resume")) return "researched";
  if (text.includes("ghost")) return "hold";
  if (text.includes("suspicious") || text.includes("watch")) return "verify";
  if (score !== null && score >= 4.4) return "apply";
  if (score !== null && score >= 4.0) return "verify";
  if (score !== null && score >= 3.5) return "watch";
  return "hold";
}

function inferGeo(text, company = "") {
  const lower = text.toLowerCase();
  const companyLower = company.toLowerCase();
  const singaporeDefaultCompanies = [
    "gic",
    "goldman",
    "point72",
    "cubist",
    "citadel",
    "worldquant",
    "jump",
    "schonfeld",
    "blocktech",
    "selini",
    "grasshopper",
    "graviton"
  ];
  if (lower.includes("dallas") || lower.includes("texas") || lower.includes("y'all")) return "Texas/Dallas";
  if (lower.includes("singapore") || lower.includes(" sg ") || lower.endsWith(" sg")) return "Singapore";
  if (lower.includes("remote")) return "Remote";
  if (lower.includes("hong kong") || lower.includes("hk")) return "APAC";
  if (lower.includes("london") || lower.includes("new york") || lower.includes("chicago")) return "Location blocked";
  if (singaporeDefaultCompanies.some((name) => companyLower.includes(name))) return "Singapore";
  return "Unspecified";
}

function parseTargetCompanies() {
  const md = read(join(dataDir, "target-companies.md"));
  const rows = [];

  for (const line of md.split(/\r?\n/)) {
    if (!line.startsWith("|") || line.includes("---") || line.includes("Company | Status")) continue;
    const cells = splitRow(line);
    if (cells.length < 5) continue;
    const [company, status, fitScoreRaw, lastSeen, notes] = cells;
    if (!company || company === "Company") continue;
    const score = parseScore(fitScoreRaw);
    const fullText = `${company} ${status} ${fitScoreRaw} ${lastSeen} ${notes}`;
    rows.push({
      id: company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      company,
      status,
      fitScoreRaw,
      score,
      scoreBucket: scoreBucket(score),
      lastSeen,
      notes,
      geo: inferGeo(fullText, company),
      action: inferAction(status, score, notes)
    });
  }

  return rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.company.localeCompare(b.company));
}

function parseScanHistory() {
  const md = read(join(outputDir, "scan-history.md"));
  const scans = [];
  const sectionRe = /^##\s+(.+)$/gm;
  const matches = [...md.matchAll(sectionRe)];

  for (let i = 0; i < matches.length; i += 1) {
    const title = stripMarkdown(matches[i][1]);
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? md.length : md.length;
    const body = md.slice(start, end);
    const date = title.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    const scoreMatches = [...body.matchAll(/Fit Score:\s*([0-9.]+)/g)].map((m) => Number(m[1]));
    const companies = [...body.matchAll(/^\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|/gm)]
      .map((m) => stripMarkdown(m[1]))
      .filter((name) => name && !["Company", "회사", "주차"].includes(name) && !name.includes("---"));

    if (date) {
      scans.push({
        title,
        date,
        candidateMentions: companies.length,
        uniqueCompanies: [...new Set(companies)].length,
        scoreCount: scoreMatches.length,
        maxScore: scoreMatches.length ? Math.max(...scoreMatches) : null
      });
    }
  }

  const summaryRows = [...md.matchAll(/^\|\s*W\d+\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm)]
    .map((m) => ({
      dateLabel: stripMarkdown(m[1]),
      sgQuant: stripMarkdown(m[2]),
      aiNative: stripMarkdown(m[3]),
      remote: stripMarkdown(m[4])
    }));

  return { scans: scans.slice(-24).reverse(), summaryRows: summaryRows.slice(-12).reverse() };
}

function parseBrief() {
  const path = join(outputDir, "brief-2026-07-21-collected-postings-and-dallas-expansion.md");
  const md = read(path);
  const lines = md.split(/\r?\n/).filter(Boolean);
  return {
    title: stripMarkdown(lines[0] ?? "Quant Job Pipeline Brief"),
    scope: lines
      .filter((line) => line.startsWith("- "))
      .slice(0, 8)
      .map((line) => stripMarkdown(line.replace(/^- /, "")))
  };
}

function parseJdCache() {
  return readdirSync(jdDir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => {
      const path = join(jdDir, name);
      const md = read(path);
      const title = stripMarkdown(md.match(/^#\s+(.+)$/m)?.[1] ?? name.replace(/\.md$/, ""));
      const date = name.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? name.match(/\d{8}/)?.[0] ?? null;
      const url = md.match(/https?:\/\/[^\s)>"']+/)?.[0] ?? null;
      const excerpt = stripMarkdown(md.replace(/^#.*$/m, "").replace(/\s+/g, " ")).slice(0, 260);
      return {
        file: name,
        path: relative(root, path),
        title,
        date,
        url,
        excerpt
      };
    })
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")) || a.title.localeCompare(b.title));
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", ".git", "dist"].includes(entry.name)) walk(path, out);
    } else {
      out.push(path);
    }
  }
  return out;
}

function resumeMime(file) {
  if (file.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (file.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (file.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function inferResumeCompany(file) {
  const normalized = file.toLowerCase();
  const aliases = [
    ["point72-cubist", ["point72", "cubist"]],
    ["citadel/citsec", ["citadel-securities", "citadel_gqs", "citadel-gqs", "citadel"]],
    ["goldman sachs", ["goldman"]],
    ["gic", ["gic"]],
    ["jump trading", ["jump"]],
    ["millennium", ["millennium"]],
    ["bridgewater", ["bridgewater"]],
    ["binance", ["binance"]],
    ["imc trading", ["imc"]],
    ["hrt", ["hrt", "hudson"]],
    ["optiver", ["optiver"]],
    ["virtu financial", ["virtu"]],
    ["xtx markets", ["xtx"]],
    ["blocktech", ["blocktech"]],
    ["qcp", ["qcp"]],
    ["squarepoint capital", ["squarepoint"]],
    ["balyasny", ["balyasny"]],
    ["westbury partners", ["westbury"]],
    ["ms capital", ["ms-capital", "ms_capital"]],
    ["selini capital", ["selini"]],
    ["moreton capital partners", ["moreton"]],
    ["fionics", ["fionics"]],
    ["worldquant", ["worldquant"]],
    ["anthropic", ["anthropic"]],
    ["openai/fde", ["fde", "openai", "sonatus"]]
  ];

  for (const [company, needles] of aliases) {
    if (needles.some((needle) => normalized.includes(needle))) return company;
  }
  if (normalized.includes("quant_base") || normalized.includes("quantresearcher_base")) return "base quant";
  if (normalized.includes("master_resume") || normalized.includes("generic")) return "base general";
  return "unmapped";
}

function inferResumeKind(file) {
  const normalized = file.toLowerCase();
  if (normalized.includes("submission-kit") && normalized.includes("quant_base")) return "base quant";
  if (normalized.includes("fde") || normalized.includes("sonatus") || normalized.includes("openai")) return "base fde";
  if (normalized.includes("coverletter")) return "cover letter";
  if (normalized.includes("master") || normalized.includes("generic")) return "base general";
  return "company tailored";
}

function shouldIncludeResume(path) {
  const file = basename(path).toLowerCase();
  if (!/\.(docx|md|txt)$/.test(file)) return false;
  if (!/(resume|cv|coverletter|quantresearcher_base)/.test(file)) return false;
  if (file.includes("ralph") || file.includes("audit") || file.includes("validation") || file.includes("assessment")) return false;

  const rel = relative(workspace, path);
  if (rel.startsWith("career-vault/submission-kit")) return true;
  if (rel.startsWith("career-vault/base-quant")) return true;
  if (rel.startsWith("career-vault/company-research/docx")) return true;
  if (rel.startsWith("career-vault/company-research") && file.endsWith(".md")) return true;
  if (rel.startsWith("skills/quant-career-pipeline/outputs/company-research")) return true;

  if (rel.startsWith("skills/obsidian-resume-brain/outputs")) {
    return /(master_resume_v3|master_resume_base|resume_gic_v4|resume_gic_v3|resume_jump_v3|resume_point72_v3|resume_bridgewater_v2|resume_worldquant_v1|resume_blocktech_researcher_v2|resume_ms_capital_v1|resume_fionics_v3|resume_generic_v1)/.test(file);
  }

  return false;
}

function parseResumes(companies) {
  const companyIds = new Map(companies.map((item) => [item.company.toLowerCase(), item.id]));
  const files = [...new Set(resumeRoots.flatMap((dir) => walk(dir)).filter(shouldIncludeResume))];

  const resumes = files.map((path) => {
    const file = basename(path);
    const company = inferResumeCompany(path);
    const companyId = companyIds.get(company.toLowerCase()) ?? company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const ext = file.split(".").pop() ?? "bin";
    const id = `${companyId}-${file.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const stats = statSync(path);
    return {
      id,
      file,
      title: file.replace(/\.(docx|md|txt)$/i, "").replace(/[_-]+/g, " "),
      company,
      companyId,
      kind: inferResumeKind(path),
      format: ext,
      mime: resumeMime(file),
      sizeBytes: stats.size,
      localPath: path,
      url: `/resumes/${id}/${encodeURIComponent(file)}`
    };
  });

  const assets = Object.fromEntries(resumes.map((item) => [
    item.url,
    {
      file: item.file,
      mime: item.mime,
      base64: readFileSync(item.localPath).toString("base64")
    }
  ]));

  const safeResumes = resumes
    .map(({ localPath, ...item }) => item)
    .sort((a, b) => a.company.localeCompare(b.company) || a.kind.localeCompare(b.kind) || a.file.localeCompare(b.file));

  writeFileSync(join(site, "data", "resume-assets.json"), `${JSON.stringify(assets)}\n`);
  return safeResumes;
}

const companies = parseTargetCompanies();
const history = parseScanHistory();
const jdCache = parseJdCache();
const resumes = parseResumes(companies);
const top = companies.filter((item) => (item.score ?? 0) >= 4).slice(0, 16);

const payload = {
  generatedAt: new Date().toISOString(),
  sourceFiles: {
    targetCompanies: "data/target-companies.md",
    scanHistory: "outputs/scan-history.md",
    jdCache: "outputs/jd-cache/*.md",
    latestHtml: "outputs/quant-opportunity-dashboard-2026-07-21.html"
  },
  metrics: {
    trackedCompanies: companies.length,
    topTargets: top.length,
    jdCacheFiles: jdCache.length,
    resumeFiles: resumes.length,
    scansParsed: history.scans.length,
    applyFirst: companies.filter((item) => item.action === "apply").length,
    verify: companies.filter((item) => item.action === "verify").length,
    watch: companies.filter((item) => item.action === "watch").length,
    researched: companies.filter((item) => item.action === "researched").length
  },
  latestBrief: parseBrief(),
  companies,
  top,
  history,
  jdCache,
  resumes
};

writeFileSync(join(site, "data", "dashboard.json"), `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote dashboard data: ${companies.length} companies, ${jdCache.length} JD files, ${resumes.length} resumes`);
