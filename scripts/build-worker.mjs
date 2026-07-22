import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const site = new URL("../", import.meta.url).pathname;
const html = readFileSync(join(site, "index.html"), "utf8");
const data = readFileSync(join(site, "data", "dashboard.json"), "utf8");
const resumeAssets = readFileSync(join(site, "data", "resume-assets.json"), "utf8");

const worker = `const html = ${JSON.stringify(html)};
const data = ${JSON.stringify(data)};
const resumeAssets = ${resumeAssets};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/data/dashboard.json")) {
      return new Response(data, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }

    if (url.pathname.startsWith("/resumes/")) {
      const asset = resumeAssets[url.pathname];
      if (!asset) return new Response("Resume not found", { status: 404 });
      const binary = Uint8Array.from(atob(asset.base64), (char) => char.charCodeAt(0));
      return new Response(binary, {
        headers: {
          "content-type": asset.mime,
          "content-disposition": \`inline; filename="\${asset.file.replace(/"/g, "")}"\`,
          "cache-control": "no-store"
        }
      });
    }

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }
};
`;

writeFileSync(join(site, "index.js"), worker);
console.log("Wrote Sites worker entrypoint: index.js");
