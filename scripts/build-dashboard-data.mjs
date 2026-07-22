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
  const text = `${status} ${notes}`.toLowerCase();
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
  if (lower.includes("singapore") || lower.includes(" sg ") || lower.endsWith(" sg")) return "Singapore";
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
  ["ms capital", ["ms capital", "ms-capital"]]
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
  ["blocktech", "https://www.blocktech.com/careers"],
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
  ["g-research", "https://www.gresearch.com/vacancies/"]
]);

function companyNeedles(company) {
  const normalized = company.toLowerCase();
  const needles = new Set(
    normalized
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !["research", "capital", "trading", "experienced", "quant", "street", "jobs", "careers"].includes(token))
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
  if (normalized.includes("quant_base") || normalized.includes("quantresearcher_base")) return "base quant";
  if (normalized.includes("master_resume") || normalized.includes("generic")) return "base general";
  return "unmapped";
}

function inferResumeKind(file) {
  const normalized = file.toLowerCase();
  if (normalized.includes("submission-kit") && normalized.includes("quant_base")) return "base quant";
  if (normalized.includes("quantresearcher_base")) return "base quant";
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
  const versions = [...normalized.matchAll(/(?:^|[_-])v(\d+)(?:[_\-.]|$)/g)].map((match) => Number(match[1]));
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
    ["korea-global-investment-forum-2026", "Korea Global Investment Forum 2026", "2026-09-09", "2026-09-09", "Korea", "Four Seasons Hotel, Seoul", "invite-only", "Investment / Institutional", "high", "Korean institutional allocator forum for senior fund decision-makers; high value only through a warm institutional route.", "Institutional Investor", "https://register.institutionalinvestor.com/2026-korea-global-investment-forum", "request intro", "Chatham House Rule, closed to press, and invitation-only for senior fund decision-makers. Try AssetPlus / AlphaBridge network before cold registration."],
    ["avcj-private-equity-forum-korea-2026", "AVCJ Private Equity Forum Korea 2026", "2026-09-11", "2026-09-11", "Korea", "Four Seasons Hotel, Seoul", "in-person", "Alternatives / Private Equity", "medium", "Flagship Korea alternatives forum for GPs and LPs; better institutional signal than generic conference-alert pages.", "ION Analytics Community", "https://community.ionanalytics.com/avcj-private-equity-forum-korea-2026", "watch", "Private equity and credit focus; relevant for allocator/network context rather than quant trading."],
    ["cqf-ai-ml-quant-finance-2026", "AI and Machine Learning in Quant Finance Conference", "2026-09-16", "2026-09-16", "Virtual / Global", "Online, 20:00-02:00 KST", "online", "Quant / AI", "high", "Most direct low-cost Helix fit: AI/ML in quant finance, online access, published speakers and partial program.", "CQF Institute", "https://cqfinstitute.org/events/conferences/ai-and-machine-learning-in-quant-finance/", "register now", "Official schedule is 12:00-18:00 BST, which is Sep 16 20:00 to Sep 17 02:00 KST."],
    ["kbw-2026", "Korea Blockchain Week 2026", "2026-09-29", "2026-10-01", "Korea", "Walkerhill Hotels & Resorts + Upbit Institutional Summit, Seoul", "in-person", "Crypto / Institutional", "high", "Korea anchor crypto week; main conference is useful, but Sep 29 institutional access is separate and invitation-driven.", "Korea Blockchain Week", "https://koreablockchainweek.com/", "register + request invite", "Sep 29 is Upbit Institutional Summit by invitation; public main conference is Sep 30-Oct 1 at Walkerhill Hotels & Resorts."],
    ["token2049-singapore-2026", "TOKEN2049 Singapore", "2026-10-07", "2026-10-08", "East Asia / Singapore", "Marina Bay Sands, Singapore", "in-person", "Crypto / Institutional", "high", "Major APAC crypto capital markets event; strong only if paired with pre-booked Singapore company/fund meetings.", "TOKEN2049", "https://www.token2049.com/singapore", "travel only with meetings", "Official tickets are on sale. Do not travel just for hallway exposure; bundle with Singapore career/fund meetings."],
    ["ask-global-conference-2026", "ASK Global Conference 2026", "2026-10-28", "2026-10-28", "Korea", "Conrad Seoul", "in-person", "Alternatives / Institutional", "medium", "KED alternative investment conference; private debt, private equity, hedge fund, multi-asset allocator signal.", "KED ASK", "https://www.kedask.com/", "watch", "Useful Korea allocator-network signal; relevant for hedge fund and multi-asset context."],
    ["hk-fintech-week-2026", "Hong Kong FinTech Week x StartmeupHK 2026", "2026-11-02", "2026-11-06", "East Asia / Hong Kong", "HKCEC and multiple venues, Hong Kong", "in-person", "Fintech / AI / Web3", "medium", "Asia flagship fintech event; paid main conference is Nov 2-3 at HKCEC, while Nov 4-6 is broader community and side-event week.", "Hong Kong FinTech Week", "https://www.fintechweek.hk/", "travel only with meetings", "Good only if there are target meetings in Hong Kong or relevant AI/digital-asset sessions. Not a pure quant event."],
    ["devcon-8-2026", "Devcon 8", "2026-11-03", "2026-11-06", "Far / Virtual Watch", "Mumbai, India", "in-person", "Crypto / DeFi Research", "medium", "Farther travel, but strong DeFi/research signal; track streams or recordings if available.", "Ethereum Foundation Devcon", "https://devcon.org/en/", "virtual watch", "Use only if virtual/recorded access is practical or if India trip becomes useful."],
    ["invest-korea-summit-2026", "Invest KOREA Summit 2026", "2026-11-04", "2026-11-06", "Korea", "Grand InterContinental Seoul Parnas", "in-person", "Investment / Korea Market", "medium", "Macro/investment network for Korea market and global capital flows.", "InvestKOREA", "https://www.investkorea.org/ik-en/cntnts/i-5112/web.do", "watch", "2026 dates are from InvestKOREA public save-the-date posts; official site still mostly describes prior editions."],
    ["bitcoin-plus-plus-seoul-2026", "bitcoin++ Seoul - Privacy Edition", "2026-11-05", "2026-11-06", "Korea", "Page Project, Seoul", "in-person", "Crypto / Bitcoin Engineering", "medium", "Technical Bitcoin privacy/P2P exchange event; better for protocol and market-structure contacts than general investing.", "bitcoin++", "https://btcpp.dev/seoul", "track", "Co-located with Bitcoin Korea Conference week."],
    ["bitcoin-korea-conference-2026", "Bitcoin Korea Conference 2026", "2026-11-07", "2026-11-08", "Korea", "COEX Convention & Exhibition Center, Seoul", "conference; online access listed", "Crypto / Bitcoin", "high", "Korea Bitcoin conference focused on Bitcoin education, workshops, Lightning market, and community building.", "Plan B Academy", "https://planb.academy/events/742dfc51-2ae2-4677-a97b-0e2f246f59ac", "register", "Plan B lists Access as Online; verify whether that means streamed access or online ticketing before assuming virtual attendance."],
    ["quantminds-international-2026", "QuantMinds International 2026", "2026-11-16", "2026-11-19", "Far / Virtual Watch", "London, UK", "in-person", "Quant Finance", "medium", "World-scale quant finance conference; far travel, so track virtual/material access first.", "Informa Connect", "https://informaconnect.com/quantminds-international/", "virtual watch", "Relevant for global quant research agenda; only worth travel if networking target is clear."],
    ["apef-2026", "Asia-Pacific Conference on Economics and Finance 2026", "2026-12-10", "2026-12-11", "East Asia / Singapore", "Singapore", "hybrid", "Finance / Economics", "watch", "Hybrid economics and finance conference for academics, government, and private-sector finance professionals.", "East Asia Research", "https://apef.ear.com.sg/", "virtual watch", "Optional research/networking signal only; not a quant trading conference."],
    ["global-ai-finance-research-2026", "Global AI Finance Research Conference", "2026-12-14", "2026-12-15", "East Asia / Taiwan", "Taipei, Taiwan", "in-person", "AI Finance / Research", "medium", "Direct AI finance research angle in East Asia.", "Global AI Finance Research Conference", "https://www.aifinconf.org/", "watch", "Track program/speaker release for quant relevance."]
  ].map(([id, title, startDate, endDate, region, location, format, category, priority, fit, sourceName, sourceUrl, status, notes]) => ({
    id, title, startDate, endDate, region, location, format, category, priority, fit, sourceName, sourceUrl, status, notes
  })).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
}

function fundWatchSources() {
  return [
    ["jane-street-programs-events", "Jane Street", "Programs and Events", "https://www.janestreet.com/join-jane-street/programs-and-events/", "high", "Monitor for QTC, Preview, researcher programs, and APAC recruiting events."],
    ["citadel-securities-programs-events", "Citadel Securities", "Programs and Events", "https://www.citadelsecurities.com/careers/students/programs-and-events/", "high", "Monitor Quant Invitational, Trading Invitational, PhD Summit, Datathons, and APAC postings."],
    ["optiver-events-2026", "Optiver", "Recruiting Events", "https://www.optiver.com/join-us/events/", "high", "Monitor trading-floor AI events, recruiting sessions, and APAC additions."],
    ["two-sigma-quant-events-2026", "Two Sigma", "Quant Research / Data Science", "https://www.twosigma.com/careers/quantitative-research-data-science/", "medium", "Monitor research-facing programs, seminars, internships, and campus connections."],
    ["imc-programs-events-2026", "IMC Trading", "Programs", "https://www.imc.com/us/careers/students-graduates/programs", "medium", "Monitor trading simulations, coding challenges, and APAC careers pages."],
    ["jump-research-programs-2026", "Jump Trading", "Students and New Grads", "https://www.jumptrading.com/hr/students-new-grads", "medium", "Monitor future programs; Probability Cup already ended in July 2026."]
  ].map(([id, company, title, sourceUrl, priority, notes]) => ({ id, company, title, sourceUrl, priority, notes }));
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
