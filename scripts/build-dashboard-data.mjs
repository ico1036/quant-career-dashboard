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

const sourceFilesAvailable = existsSync(join(dataDir, "target-companies.md"))
  && existsSync(join(outputDir, "scan-history.md"))
  && existsSync(jdDir);

if (!sourceFilesAvailable) {
  console.log("Workspace source files unavailable; keeping committed dashboard data for remote build");
  process.exit(0);
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
  const statusText = `${status}`.toLowerCase();
  const text = `${status} ${notes}`.toLowerCase();
  if (statusText.includes("applied")) return "applied";
  if (text.includes("researched") || text.includes("resume")) return "researched";
  if (text.includes("ghost")) return "hold";
  if (text.includes("suspicious") || text.includes("watch")) return "verify";
  if (score !== null && score >= 4.4) return "apply";
  if (score !== null && score >= 4.0) return "verify";
  if (score !== null && score >= 3.5) return "watch";
  return "hold";
}

function actionDetails(action) {
  const details = {
    applied: {
      label: "Applied",
      meaning: "Application submitted",
      nextStep: "Track response and prepare follow-up if no reply"
    },
    apply: {
      label: "Apply now",
      meaning: "Clean high-priority target",
      nextStep: "Open posting, use paired resume, submit or start Phase 3 package"
    },
    verify: {
      label: "Verify first",
      meaning: "Promising but needs a quick check",
      nextStep: "Confirm JD, location, seniority, and active status before spending resume cycle"
    },
    watch: {
      label: "Watch",
      meaning: "Useful signal, not urgent today",
      nextStep: "Keep tracking for new SG/remote QR or ML openings"
    },
    researched: {
      label: "Already researched",
      meaning: "Company has prior research or tailored resume",
      nextStep: "Reuse existing materials; only refresh if the JD changed"
    },
    hold: {
      label: "Hold",
      meaning: "Low fit, blocked, stale, or suspicious",
      nextStep: "Do not spend resume cycle unless a cleaner role appears"
    },
    unknown: {
      label: "Review",
      meaning: "Not enough signal",
      nextStep: "Manually inspect source before action"
    }
  };
  return details[action] ?? details.unknown;
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
  if (lower.includes("miami")) return "Miami hybrid";
  if (lower.includes("singapore") || lower.includes(" sg ") || lower.endsWith(" sg")) return "Singapore";
  if (lower.includes("tokyo") || lower.includes("japan")) return "Tokyo / Japan";
  if (lower.includes("remote")) return "Remote";
  if (lower.includes("hong kong") || lower.includes("hk")) return "APAC";
  if (lower.includes("london") || lower.includes("new york") || lower.includes("chicago")) return "Location blocked";
  if (singaporeDefaultCompanies.some((name) => companyLower.includes(name))) return "Singapore";
  return "Unspecified";
}

const companyAliasRules = [
  ["point72-cubist", ["point72", "cubist"]],
  ["citadel", ["citadel", "citsec", "citadel securities", "gqs"]],
  ["goldman sachs", ["goldman"]],
  ["jane street", ["jane street"]],
  ["gic", ["gic", "ai alpha"]],
  ["drw", ["drw"]],
  ["jump trading", ["jump"]],
  ["worldquant", ["worldquant"]],
  ["crypto.com", ["crypto.com", "crypto"]],
  ["graviton research capital", ["graviton"]],
  ["imc trading", ["imc"]],
  ["qube research technologies", ["qube"]],
  ["binance", ["binance"]],
  ["qcp", ["qcp"]],
  ["hrt", ["hrt", "hudson river"]],
  ["optiver", ["optiver"]],
  ["virtu financial", ["virtu"]],
  ["xtx markets", ["xtx"]],
  ["blocktech", ["blocktech"]],
  ["selini capital", ["selini"]],
  ["bridgewater", ["bridgewater"]],
  ["millennium", ["millennium"]],
  ["squarepoint capital", ["squarepoint"]],
  ["balyasny", ["balyasny"]],
  ["kronos research", ["kronos"]],
  ["grasshopper", ["grasshopper"]],
  ["schonfeld", ["schonfeld"]],
  ["g-research", ["g-research", "gresearch"]],
  ["jane street", ["jane street"]],
  ["quantedge", ["quantedge"]],
  ["moreton capital partners", ["moreton"]],
  ["fionics", ["fionics"]],
  ["ms capital", ["ms capital", "ms-capital"]],
  ["options group internal", ["options group internal"]]
];

const careersFallback = new Map([
  ["gic", "https://careers.gic.com.sg/"],
  ["drw", "https://www.drw.com/work-at-drw/listings"],
  ["citadel", "https://www.citadel.com/careers/open-opportunities/"],
  ["citadel securities", "https://www.citadelsecurities.com/careers/open-opportunities/"],
  ["goldman sachs", "https://higher.gs.com/"],
  ["jane street", "https://www.janestreet.com/join-jane-street/open-roles/"],
  ["point72-cubist", "https://careers.point72.com/"],
  ["point72", "https://careers.point72.com/"],
  ["cubist", "https://careers.point72.com/"],
  ["jump trading", "https://www.jumptrading.com/careers/"],
  ["worldquant", "https://www.worldquant.com/career-listing/"],
  ["crypto.com", "https://crypto.com/careers"],
  ["graviton research capital", "https://www.gravitontrading.com/careers.html"],
  ["imc trading", "https://www.imc.com/ap/careers/"],
  ["qube research technologies", "https://www.qube-rt.com/careers/"],
  ["binance", "https://www.binance.com/en/careers"],
  ["qcp", "https://www.qcpgroup.com/careers"],
  ["hrt", "https://www.hudsonrivertrading.com/careers/"],
  ["optiver", "https://optiver.com/working-at-optiver/career-opportunities/"],
  ["virtu financial", "https://www.virtu.com/careers/"],
  ["xtx markets", "https://www.xtxmarkets.com/careers/"],
  ["blocktech", "https://www.block-tech.io/careers"],
  ["citi", "https://jobs.citi.com/"],
  ["selini capital", "https://www.selini.capital/careers"],
  ["grasshopper", "https://www.grasshopperasia.com/careers"],
  ["fionics", "https://www.fionics.com/jobs"],
  ["quantedge", "https://www.quantedge.com/careers"],
  ["b2c2", "https://www.b2c2.com/careers"],
  ["marshall wace", "https://www.mwam.com/careers/"],
  ["eastspring", "https://www.eastspring.com/about-us/careers"],
  ["julius baer", "https://www.juliusbaer.com/en/careers/"],
  ["mercuria", "https://mercuria.com/careers/"],
  ["monad foundation", "https://www.monad.xyz/careers"],
  ["oxford knight", "https://www.oxfordknight.co.uk/jobs/"],
  ["anson mccade", "https://www.ansonmccade.com/jobs/"],
  ["charterhouse", "https://www.charterhouse.com.sg/jobs"],
  ["ellwood consulting", "https://www.ellwoodconsulting.com/jobs/"],
  ["bridgewater", "https://www.bridgewater.com/working-at-bridgewater/job-openings"],
  ["millennium", "https://www.mlp.com/careers/"],
  ["squarepoint capital", "https://www.squarepoint-capital.com/careers"],
  ["balyasny", "https://www.bamfunds.com/careers/"],
  ["schonfeld", "https://www.schonfeld.com/careers/"],
  ["g-research", "https://www.gresearch.com/vacancies/"],
  ["nurp", "https://nurp.rippling-ats.com/"],
  ["dv trading", "https://dvtrading.co/join-dv/"],
  ["okx", "https://www.okx.com/en-us/join-us/openings"],
  ["keyrock", "https://jobs.ashbyhq.com/keyrock"],
  ["wormhole labs", "https://jobs.ashbyhq.com/wormholelabs"],
  ["second foundation", "https://job-boards.eu.greenhouse.io/sfweb/jobs/4631230101"],
  ["aaa global", "https://aaaglobal.co.uk/"],
  ["trexquant", "https://trexquant.com/global-alpha-researcher"],
  ["arbwick", "https://arbwick.com/"]
]);

function companyNeedles(company) {
  const normalized = company.toLowerCase();
  const needles = new Set(
    normalized
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3 && ![
        "research",
        "capital",
        "trading",
        "experienced",
        "quant",
        "street",
        "jobs",
        "careers",
        "group",
        "internal",
        "recruiter",
        "anonymous",
        "client",
        "singapore",
        "global",
        "management",
        "fund",
        "investment",
        "partners",
        "options"
      ].includes(token))
  );

  for (const [canonical, aliases] of companyAliasRules) {
    if (aliases.some((alias) => normalized.includes(alias))) {
      needles.add(canonical);
      aliases.forEach((alias) => needles.add(alias));
    }
  }

  return [...needles];
}

function fallbackJobUrl(company) {
  const normalized = company.toLowerCase();
  for (const [key, url] of careersFallback) {
    if (normalized.includes(key) || key.includes(normalized)) return url;
  }
  for (const [, aliases] of companyAliasRules) {
    if (aliases.some((alias) => normalized.includes(alias))) {
      const canonical = aliases.find((alias) => careersFallback.has(alias));
      if (canonical) return careersFallback.get(canonical);
    }
  }
  return `https://www.google.com/search?q=${encodeURIComponent(`${company} careers quant jobs`)}`;
}

function bestJdForCompany(company, jdCache) {
  const needles = companyNeedles(company.company);
  const geo = company.geo.toLowerCase();
  const scored = jdCache
    .filter((jd) => jd.url)
    .map((jd) => {
      const haystack = `${jd.title} ${jd.file} ${jd.excerpt}`.toLowerCase();
      let score = 0;
      let companyScore = 0;
      for (const needle of needles) {
        if (!needle) continue;
        if (haystack.includes(needle)) companyScore += needle.length > 8 ? 5 : 3;
      }
      score += companyScore;
      if (geo.includes("singapore") && haystack.includes("singapore")) score += 3;
      if (geo.includes("remote") && haystack.includes("remote")) score += 2;
      if (geo.includes("texas") && (haystack.includes("texas") || haystack.includes("remote"))) score += 2;
      if (/machine learning|quantitative researcher|quant research|ai alpha|prediction markets/i.test(haystack)) score += 1;
      if (/intern|graduate|university/i.test(haystack) && !/intern|graduate|university/i.test(company.notes)) score -= 2;
      return { jd, score, companyScore };
    })
    .filter((item) => item.companyScore > 0)
    .sort((a, b) => b.score - a.score || String(b.jd.date ?? "").localeCompare(String(a.jd.date ?? "")));

  return scored[0]?.jd ?? null;
}

function enrichCompanyLinks(companies, jdCache) {
  return companies.map((company) => {
    const jd = bestJdForCompany(company, jdCache);
    const fallback = fallbackJobUrl(company.company);
    const details = actionDetails(company.action);
    return {
      ...company,
      actionLabel: details.label,
      actionMeaning: details.meaning,
      actionNextStep: details.nextStep,
      jobTitle: jd?.title ?? (fallback ? `${company.company} careers` : null),
      jobUrl: jd?.url ?? fallback,
      jobSource: jd ? "cached JD" : (fallback?.includes("google.com/search") ? "job search" : "careers page")
    };
  });
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
    const action = inferAction(status, score, notes);
    const actionDetail = actionDetails(action);
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
      action,
      actionLabel: actionDetail.label,
      actionMeaning: actionDetail.meaning,
      actionNextStep: actionDetail.nextStep
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
  if (normalized.includes("quant_base") || normalized.includes("base_quant") || normalized.includes("quantresearcher_base")) return "base quant";
  if (normalized.includes("master_resume") || normalized.includes("generic")) return "base general";
  return "unmapped";
}

function inferResumeKind(file) {
  const normalized = file.toLowerCase();
  if (normalized.includes("submission-kit") && (normalized.includes("quant_base") || normalized.includes("base_quant"))) return "base quant";
  if (normalized.includes("quant_base") || normalized.includes("base_quant") || normalized.includes("quantresearcher_base")) return "base quant";
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

function resumeVersion(file) {
  const normalized = file.toLowerCase();
  const versions = [...normalized.matchAll(/(?:^|[^a-z0-9])v(\d+)(?=[^a-z0-9]|$)|v(\d+)(?=[^a-z0-9]|$)/g)]
    .map((match) => Number(match[1] ?? match[2]));
  return versions.length ? Math.max(...versions) : 0;
}

function compareResumeFreshness(a, b) {
  const kindRank = { "company tailored": 5, "base quant": 4, "base fde": 4, "base general": 3, "cover letter": 2 };
  const av = [kindRank[a.kind] ?? 0, a.version, a.mtimeMs, a.file.length];
  const bv = [kindRank[b.kind] ?? 0, b.version, b.mtimeMs, b.file.length];
  for (let i = 0; i < av.length; i += 1) {
    if (av[i] !== bv[i]) return bv[i] - av[i];
  }
  return a.file.localeCompare(b.file);
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
    const kind = inferResumeKind(path);
    return {
      id,
      file,
      title: file.replace(/\.(docx|md|txt)$/i, "").replace(/[_-]+/g, " "),
      company,
      companyId,
      kind,
      format: ext,
      mime: resumeMime(file),
      sizeBytes: stats.size,
      version: resumeVersion(file),
      mtimeMs: stats.mtimeMs,
      modifiedAt: stats.mtime.toISOString(),
      localPath: path,
      url: `/resumes/${id}/${encodeURIComponent(file)}`
    };
  });

  const latestIds = new Set();
  const groups = new Map();
  for (const resume of resumes) {
    const key = `${resume.companyId}::${resume.kind}::${resume.format}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(resume);
  }
  for (const group of groups.values()) {
    group.sort(compareResumeFreshness);
    if (group[0]) latestIds.add(group[0].id);
  }

  const assets = Object.fromEntries(resumes.map((item) => [
    item.url,
    {
      file: item.file,
      mime: item.mime,
      base64: readFileSync(item.localPath).toString("base64")
    }
  ]));

  const safeResumes = resumes
    .map(({ localPath, mtimeMs, ...item }) => ({
      ...item,
      layer: latestIds.has(item.id) ? "current" : "archive",
      isLatest: latestIds.has(item.id)
    }))
    .sort((a, b) => {
      if (a.layer !== b.layer) return a.layer === "current" ? -1 : 1;
      return a.company.localeCompare(b.company) || a.kind.localeCompare(b.kind) || b.version - a.version || a.file.localeCompare(b.file);
    });

  writeFileSync(join(site, "data", "resume-assets.json"), `${JSON.stringify(assets)}\n`);
  return safeResumes;
}

function trackedEvents() {
  return [
    ["origin-seoul-2026", "ORIGIN SEOUL 2026", "2026-08-31", "2026-09-02", "Korea", "Bitcoin House Origin + Lotte World Tower SKY31, Seoul", "in-person", "Crypto / Bitcoin", "high", "Bitcoin-only Korea capital/ecosystem network; useful for Bitcoin market structure and local digital asset capital contacts.", "ORIGIN SEOUL", "https://originseoulbtc.com/", "track / register", "Aug 31 VIP Day is at Bitcoin House Origin; Sep 1 Industry Day and Sep 2 Public Day are at Lotte World Tower SKY31. More Bitcoin ecosystem than Helix-specific quant."],
    ["investops-asia-2026", "InvestOps Asia 2026", "2026-08-19", "2026-08-20", "East Asia / Singapore", "One Farrer Hotel, Singapore", "in-person", "Investment Operations / Buy Side", "medium", "Buy-side operations, data, transformation, and private-markets event; useful for Singapore asset-manager network but less direct for front-office quant alpha.", "Worldwide Business Research / InvestOps Asia", "https://investopsasia.wbresearch.com/", "watch / target buy-side ops contacts", "Official page confirms Aug 19-20 at One Farrer Hotel. Keep below AI finance and trading-specific events because it is operations-heavy."],
    ["korea-global-investment-forum-2026", "Korea Global Investment Forum 2026", "2026-09-09", "2026-09-09", "Korea", "Four Seasons Hotel, Seoul", "invite-only", "Investment / Institutional", "high", "Korean institutional allocator forum for senior fund decision-makers; high value only through a warm institutional route.", "Institutional Investor", "https://register.institutionalinvestor.com/2026-korea-global-investment-forum", "request intro", "Chatham House Rule, closed to press, and invitation-only for senior fund decision-makers. Try AssetPlus / AlphaBridge network before cold registration."],
    ["avcj-private-equity-forum-korea-2026", "AVCJ Private Equity Forum Korea 2026", "2026-09-11", "2026-09-11", "Korea", "Four Seasons Hotel, Seoul", "in-person", "Alternatives / Private Equity", "medium", "Flagship Korea alternatives forum for GPs and LPs; better institutional signal than generic conference-alert pages.", "ION Analytics Community", "https://community.ionanalytics.com/avcj-private-equity-forum-korea-2026", "watch", "Private equity and credit focus; relevant for allocator/network context rather than quant trading."],
    ["cqf-ai-ml-quant-finance-2026", "AI and Machine Learning in Quant Finance Conference", "2026-09-16", "2026-09-16", "Virtual / Global", "Online, 20:00-02:00 KST", "online", "Quant / AI", "high", "Most direct low-cost Helix fit: AI/ML in quant finance, online access, published speakers and partial program.", "CQF Institute", "https://cqfinstitute.org/events/conferences/ai-and-machine-learning-in-quant-finance/", "register now", "Official schedule is 12:00-18:00 BST, which is Sep 16 20:00 to Sep 17 02:00 KST."],
    ["kbw-2026", "Korea Blockchain Week 2026", "2026-09-29", "2026-10-01", "Korea", "Walkerhill Hotels & Resorts + Upbit Institutional Summit, Seoul", "in-person", "Crypto / Institutional", "high", "Korea anchor crypto week; main conference is useful, but Sep 29 institutional access is separate and invitation-driven.", "Korea Blockchain Week", "https://koreablockchainweek.com/", "register + request invite", "Sep 29 is Upbit Institutional Summit by invitation; public main conference is Sep 30-Oct 1 at Walkerhill Hotels & Resorts."],
    ["token2049-singapore-2026", "TOKEN2049 Singapore", "2026-10-07", "2026-10-08", "East Asia / Singapore", "Marina Bay Sands, Singapore", "in-person", "Crypto / Institutional", "high", "Major APAC crypto capital markets event; strong only if paired with pre-booked Singapore company/fund meetings.", "TOKEN2049", "https://www.token2049.com/singapore", "travel only with meetings", "Official tickets are on sale. Do not travel just for hallway exposure; bundle with Singapore career/fund meetings."],
    ["asifma-future-liquidity-apac-2026", "ASIFMA Future of Liquidity in Asia Pacific Capital Markets Conference", "2026-10-09", "2026-10-09", "East Asia / Hong Kong", "Ritz Carlton, Hong Kong", "in-person; approval required", "Market Structure / Liquidity", "medium", "Capital-markets liquidity conference covering AI, algo trading, collateral, repo, securities lending, DLT and tokenization; useful if Hong Kong meetings are bundled.", "ASIFMA", "https://www.asifma.org/event/the-future-of-liquidity-in-asia-pacific-capital-markets-conference/", "watch / register if HK meetings exist", "Official ASIFMA page confirms Oct 9 at Ritz Carlton Hong Kong. Registration requires approval; stronger market-structure signal than generic fintech, but travel only with meetings."],
    ["energy-risk-asia-2026", "Energy Risk Asia 2026", "2026-10-19", "2026-10-19", "East Asia / Singapore", "SGX Centre Auditorium, Singapore", "in-person", "Commodities / Energy Trading Risk", "medium", "Relevant for commodities, energy-risk, trading, and compliance network in Singapore; useful only if targeting commodity trading or risk desks.", "Risk.net / Energy Risk", "https://asia.energyrisk.com/", "watch / targeted networking", "Official Risk.net event page confirms Oct 19 at SGX Centre Auditorium. Trading relevance is commodities/risk, not pure quant research."],
    ["risk-live-asia-2026", "Risk Live Asia 2026", "2026-10-21", "2026-10-22", "East Asia / Singapore", "Singapore", "in-person", "Risk / Derivatives / Markets", "medium", "Risk.net Asia event for senior risk, derivatives, compliance, markets, and technology leaders; good Singapore finance network but not a quant-research conference.", "Risk Live Asia", "https://asia.risklive.net/", "watch / targeted networking", "Official Risk Live page confirms Asia event in October 2026; Risk Live global page lists Oct 21-22. Use for risk/markets network, not standalone travel."],
    ["fx-markets-asia-2026", "FX Markets Asia 2026", "2026-10-22", "2026-10-22", "East Asia / Singapore", "Marina Bay Sands Expo and Convention Centre, Singapore", "in-person", "FX / Trading / Market Structure", "medium", "FX trading practitioner event for buy-side, sell-side, regulators, and market-makers; useful Singapore market-structure network if targeting FX/trading desks.", "FX Markets", "https://asia.fx-markets.com/", "watch / targeted networking", "Official FX Markets Asia page confirms Oct 22 at Marina Bay Sands Expo and Convention Centre. Stronger trading fit than generic fintech, but still networking-led."],
    ["ask-global-conference-2026", "ASK Global Conference 2026", "2026-10-28", "2026-10-28", "Korea", "Conrad Seoul", "in-person", "Alternatives / Institutional", "medium", "KED alternative investment conference; private debt, private equity, hedge fund, multi-asset allocator signal.", "KED ASK", "https://www.kedask.com/", "watch", "Useful Korea allocator-network signal; relevant for hedge fund and multi-asset context."],
    ["hk-fintech-week-2026", "Hong Kong FinTech Week x StartmeupHK 2026", "2026-11-02", "2026-11-06", "East Asia / Hong Kong", "HKCEC and multiple venues, Hong Kong", "in-person", "Fintech / AI / Web3", "medium", "Asia flagship fintech event; paid main conference is Nov 2-3 at HKCEC, while Nov 4-6 is broader community and side-event week.", "Hong Kong FinTech Week", "https://www.fintechweek.hk/", "travel only with meetings", "Good only if there are target meetings in Hong Kong or relevant AI/digital-asset sessions. Not a pure quant event."],
    ["devcon-8-2026", "Devcon 8", "2026-11-03", "2026-11-06", "Far / Virtual Watch", "Jio World Centre, Mumbai", "in-person", "Crypto / DeFi Research", "medium", "Ethereum Foundation flagship conference; relevant for DeFi research, protocol infrastructure, and crypto market structure.", "Ethereum Foundation Devcon", "https://devcon.org/en/", "track live/recorded", "Tickets process is underway. Track official live or recorded access; India travel is low priority unless paired with a concrete meeting or speaking reason."],
    ["invest-korea-summit-2026", "Invest KOREA Summit 2026", "2026-11-04", "2026-11-06", "Korea", "Grand InterContinental Seoul Parnas", "in-person; approval required", "Investment / Korea Market", "watch", "Korea investment and partnership event; useful for overseas investment attraction or partnerships, not a quant-specific conference.", "InvestKOREA", "https://www.investkorea.org/ik-en/cntnts/i-5169/web.do", "apply only if relevant", "Free but approval-based registration; official registration deadline is Oct 9. Registration page: https://www.investkorea.org/ik-en/cntnts/i-5172/web.do?clickArea=enmain00009"],
    ["bitcoin-plus-plus-seoul-2026", "bitcoin++ Seoul - Privacy Edition", "2026-11-05", "2026-11-06", "Korea", "Page Project, Seoul", "in-person", "Crypto / Bitcoin Engineering", "medium", "Developer and researcher-centered Bitcoin privacy/P2P event; useful for protocol and market-structure contacts.", "bitcoin++", "https://btcpp.dev/seoul", "track", "Attend if the goal is Bitcoin protocol, privacy, P2P exchange, or market-structure network rather than general investing."],
    ["bitcoin-korea-conference-2026", "Bitcoin Korea Conference 2026", "2026-11-07", "2026-11-08", "Korea", "Nov 7 COEX; Nov 8 Korea Federation of Banks + Community House Masil, Seoul", "in-person", "Crypto / Bitcoin", "medium", "Official offline Bitcoin Korea event focused on Bitcoin education, Lightning market, workshops, and community network.", "Bitcoin Korea Conference", "https://www.bitcoinkoreaconference.com/en/schedule", "register if protocol/network goal", "Removed hybrid label. Treat Plan B Academy's Access: Online metadata as wrong unless the official schedule later confirms livestream access."],
    ["fix-sea-multi-asset-trading-2026", "FIX Southeast Asia Multi-Asset Trading Conference 2026", "2026-11-11", "2026-11-11", "East Asia / Malaysia", "Grand Hyatt Kuala Lumpur", "in-person", "Electronic Trading / Market Structure", "medium", "Practitioner-led electronic trading and multi-asset market-structure conference; stronger trading-relevance than generic fintech expos.", "FIX Trading Community", "https://www.fix-events.com/sea/index.html", "watch / register if nearby", "Official FIX page confirms Nov 11, 9am-5pm plus cocktail, Grand Hyatt Kuala Lumpur. Free for FIX members."],
    ["quantminds-international-2026", "QuantMinds International 2026", "2026-11-16", "2026-11-19", "Far / Virtual Watch", "InterContinental O2, London", "in-person", "Quant Finance", "medium", "Top-tier global quant finance conference; strongest content fit among far-travel events.", "Informa Connect", "https://informaconnect.com/quantminds-international/", "content watch", "No confirmed live online pass; monitor YouTube/on-demand content. London travel only if paired with speaking, recruiting, or targeted meetings."],
    ["singapore-fintech-festival-2026", "Singapore FinTech Festival 2026", "2026-11-18", "2026-11-20", "East Asia / Singapore", "Singapore EXPO, Halls 1-6 and Foyer", "in-person", "FinTech / Institutional / AI", "high", "Singapore's flagship policy, finance, fintech, AI, and digital-assets gathering; strong for MAS/GFTN network, institutional partners, and Singapore job/business meetings.", "Singapore FinTech Festival", "https://www.fintechfestival.sg/registration", "register / plan meetings", "Official SFF page confirms Nov 18-20 at Singapore EXPO. Early Bird registration ends Jul 31, 2026; attend only with pre-booked meetings or targeted sessions."],
    ["fia-asia-derivatives-2026", "FIA Asia Derivatives Conference 2026", "2026-12-01", "2026-12-03", "East Asia / Singapore", "The St. Regis Singapore", "in-person", "Derivatives / Cleared Markets", "high", "Directly relevant to derivatives market structure, exchanges, clearing, vendors, and APAC trading infrastructure; strong Singapore finance-network event.", "FIA", "https://www.fia.org/fia/events/asia-derivatives-conference", "watch / plan meetings", "Official FIA page confirms Dec 1-3 at The St. Regis Singapore. More market-structure/cleared-derivatives than quant alpha research."],
    ["apef-2026", "Asia-Pacific Conference on Economics and Finance 2026", "2026-12-10", "2026-12-11", "East Asia / Singapore", "Holiday Inn Singapore Atrium", "hybrid; virtual presenter mainly pre-recorded", "Finance / Economics", "watch", "Economics and finance conference with low Helix/quant specificity.", "East Asia Research", "https://apef.ear.com.sg/", "low priority", "Remote option appears aimed at pre-recorded virtual presenters, not a clear general livestream ticket. Keep behind higher-signal events."],
    ["global-ai-finance-research-2026", "Global AI Finance Research Conference", "2026-12-14", "2026-12-15", "East Asia / Taiwan", "Howard Civil Service International House, Taipei", "in-person only", "AI Finance / Research", "high", "Highest-priority Helix paper-submission candidate: publish frontier model x harness, evaluation design, repeatability, or post-training comparison without exposing full know-how.", "Global AI Finance Research Conference", "https://www.conftool.net/aifinconf2026/register.php", "evaluate paper submission", "Offline-only. Paper submission deadline is Aug 31; acceptance notification is Sep 30. Use the working ConfTool registration page; the aifinconf.org root/CFP URLs were unreachable in link verification on 2026-07-22."]
  ].map(([id, title, startDate, endDate, region, location, format, category, priority, fit, sourceName, sourceUrl, status, notes]) => {
    const focusRanks = {
      "global-ai-finance-research-2026": 1,
      "cqf-ai-ml-quant-finance-2026": 2,
      "kbw-2026": 3,
      "korea-global-investment-forum-2026": 4,
      "singapore-fintech-festival-2026": 5,
      "fia-asia-derivatives-2026": 6,
      "fx-markets-asia-2026": 7,
      "asifma-future-liquidity-apac-2026": 8
    };
    const verification = {
      "origin-seoul-2026": "official page confirms Aug 31-Sep 2 and Bitcoin-only Seoul positioning",
      "investops-asia-2026": "official InvestOps Asia page confirms Aug 19-20 at One Farrer Hotel, Singapore",
      "korea-global-investment-forum-2026": "official registration page confirms Sep 9, Four Seasons Seoul, invitation-only senior decision-maker access",
      "avcj-private-equity-forum-korea-2026": "official organizer/community page, added as a better Korea alternatives signal after removing bad ResearchFora listing",
      "cqf-ai-ml-quant-finance-2026": "official CQF page confirms Sep 16 online session, 12:00-18:00 BST",
      "kbw-2026": "official KBW page confirms Sep 29 Upbit Institutional Summit invite-only and Sep 30-Oct 1 main conference at Walkerhill",
      "token2049-singapore-2026": "official TOKEN2049 page confirms Oct 7-8 at Marina Bay Sands",
      "asifma-future-liquidity-apac-2026": "official ASIFMA page confirms Oct 9 at Ritz Carlton Hong Kong with liquidity, AI, algo trading, repo, securities lending, DLT and tokenization themes",
      "energy-risk-asia-2026": "official Risk.net event page confirms Oct 19, SGX Centre Auditorium, Singapore",
      "risk-live-asia-2026": "official Risk Live pages confirm Asia event in October 2026 and Oct 21-22 dates",
      "fx-markets-asia-2026": "official FX Markets Asia page confirms Oct 22 at Marina Bay Sands Expo and Convention Centre, Singapore",
      "ask-global-conference-2026": "official KED ASK page; keep as Korea allocator-network watch, not quant-specific",
      "hk-fintech-week-2026": "official page confirms Nov 2-6 at HKCEC and multiple venues; main conference vs side events must not be collapsed",
      "devcon-8-2026": "official Ethereum Foundation page confirms Mumbai, Nov 3-6; livestream/recording access still needs monitoring",
      "invest-korea-summit-2026": "official InvestKOREA pages confirm Nov 4-6 Seoul and approval-based registration",
      "bitcoin-plus-plus-seoul-2026": "official bitcoin++ page confirms Nov 5-6 Seoul privacy edition",
      "bitcoin-korea-conference-2026": "official schedule confirms Nov 7 COEX and Nov 8 bank/community venues; no official livestream confirmation",
      "fix-sea-multi-asset-trading-2026": "official FIX page confirms Nov 11 and Grand Hyatt Kuala Lumpur",
      "quantminds-international-2026": "official Informa page confirms Nov 16-19 London; no confirmed live online attendee pass",
      "singapore-fintech-festival-2026": "official SFF page confirms Nov 18-20, Singapore EXPO, and registration access",
      "fia-asia-derivatives-2026": "official FIA page confirms Dec 1-3 at The St. Regis Singapore",
      "apef-2026": "official APEF page confirms hybrid Singapore conference, but remote mode is mainly virtual presenter/pre-recorded",
      "global-ai-finance-research-2026": "official ConfTool page opens and identifies the 2026 Global AI Finance Research Conference; original aifinconf.org root was unreachable during link check"
    };
    return {
      id, title, startDate, endDate, region, location, format, category, priority, fit, sourceName, sourceUrl, status, notes,
      focusRank: focusRanks[id] ?? 99,
      verification: {
        checkedAt: "2026-07-22",
        sourceType: "official organizer source",
        summary: verification[id] ?? "official source checked"
      }
    };
  }).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
}

function fundWatchSources() {
  return [
    ["jane-street-programs-events", "Jane Street", "Programs and Events", "https://www.janestreet.com/join-jane-street/programs-and-events/", "watch page", "monthly or email alert", "Mostly student programs; HK FTTP Sep 30-Oct 3 is student-targeted. QTC/SEE are mostly undergraduate-oriented.", "low", "Use as background monitor; experienced-hire postings are more relevant."],
    ["citadel-securities-programs-events", "Citadel Securities", "Programs and Events", "https://www.citadelsecurities.com/careers/programs-and-events/", "watch page", "monthly or email alert", "Quant Invitational and Trading Invitational skew undergraduate; PhD Summit targets current PhD/postdoc.", "low", "Few directly applicable public events for Jiwoong; experienced roles matter more."],
    ["optiver-events-2026", "Optiver", "Recruiting Events", "https://www.optiver.com/join-us/events/", "watch page", "monthly or email alert", "Remaining public events visible today are Amsterdam/London; no confirmed APAC event.", "low", "Monitor for APAC additions only."],
    ["two-sigma-quant-events-2026", "Two Sigma", "Quant Research / Data Science", "https://www.twosigma.com/careers/quantitative-research-data-science/", "watch page", "monthly or email alert", "New Seekers Summit is for early undergrads; PhD Symposium/Fellowship target current students.", "low", "Experienced-hire postings are more useful than program monitoring."],
    ["imc-programs-events-2026", "IMC Trading", "Programs", "https://www.imc.com/us/careers/students-graduates/programs", "watch page", "monthly or email alert", "Student/new-grad insight programs; no confirmed APAC public event today.", "low", "Keep only for APAC event emergence."],
    ["jump-research-programs-2026", "Jump Trading", "Signals", "https://www.jumptrading.com/signals", "watch page", "monthly or email alert", "Probability Cup ended July 19; 2026-27 Fellowship recipients already announced.", "low", "Not an ongoing event calendar; monitor lightly."]
  ].map(([id, company, title, sourceUrl, type, cadence, eligibility, priority, notes]) => ({
    id, company, title, sourceUrl, type, cadence, eligibility, priority, notes,
    verification: {
      checkedAt: "2026-07-22",
      sourceType: "official company page",
      summary: "monitor as a company page, not a dated event"
    }
  }));
}

const history = parseScanHistory();
const jdCache = parseJdCache();
const companies = enrichCompanyLinks(parseTargetCompanies(), jdCache);
const resumes = parseResumes(companies);
const top = companies.filter((item) => (item.score ?? 0) >= 4).slice(0, 16);
const events = trackedEvents();
const watchSources = fundWatchSources();

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
    currentResumeFiles: resumes.filter((item) => item.layer === "current").length,
    archivedResumeFiles: resumes.filter((item) => item.layer === "archive").length,
    upcomingEvents: events.length,
    koreaEvents: events.filter((item) => item.region === "Korea").length,
    virtualWatchEvents: events.filter((item) => item.region.includes("Virtual") || item.format.includes("online") || item.format.includes("hybrid")).length,
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
  resumes,
  events,
  watchSources
};

writeFileSync(join(site, "data", "dashboard.json"), `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote dashboard data: ${companies.length} companies, ${jdCache.length} JD files, ${resumes.length} resumes`);
