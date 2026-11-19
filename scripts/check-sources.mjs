// Checks every URL in content/**/*.json against the allowlist in content/sources.json.
// Runs before each build ("prebuild" in package.json): if a URL is on a site that is not allowed,
// the build stops, so a bad source never reaches the live site.
// Run it by hand with: node scripts/check-sources.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const contentDir = join(root, "content");
const rules = JSON.parse(readFileSync(join(contentDir, "sources.json"), "utf8"));

/** True when host is the domain itself or one of its subdomains. */
const matches = (host, domain) => host === domain || host.endsWith("." + domain);
const find = (list, host) => list.find((entry) => matches(host, entry.domain));

function jsonFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return jsonFiles(path);
    return name.endsWith(".json") ? [path] : [];
  });
}

/** Yields [jsonPath, url] for every URL found in any string of the value. */
function* urls(value, path = "") {
  if (typeof value === "string") {
    for (const m of value.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)) yield [path, m[0]];
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* urls(value[i], `${path}[${i}]`);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) yield* urls(v, path ? `${path}.${k}` : k);
  }
}

/** Yields [jsonPath, label] for every source label (an object with both "label" and "url"). */
function* sourceLabels(value, path = "") {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* sourceLabels(value[i], `${path}[${i}]`);
  } else if (value && typeof value === "object") {
    if (typeof value.label === "string" && typeof value.url === "string") yield [path, value.label];
    for (const [k, v] of Object.entries(value)) yield* sourceLabels(v, path ? `${path}.${k}` : k);
  }
}

const problems = [];
let checked = 0;

for (const file of jsonFiles(contentDir)) {
  const rel = relative(root, file).split(sep).join("/");
  if (rel === "content/sources.json") continue;
  const data = JSON.parse(readFileSync(file, "utf8"));

  for (const [path, url] of urls(data)) {
    checked++;
    let host;
    try {
      host = new URL(url).hostname.toLowerCase().replace(/^www\d?\./, "");
    } catch {
      problems.push(`${rel} › ${path}\n    ${url}\n    → not a valid URL`);
      continue;
    }
    if (rules.notSources.some((n) => n.file === rel && matches(host, n.domain))) continue;
    if (find(rules.allowed, host)) continue;
    if (rules.candidateSites.domains.some((d) => matches(host, d)) && rel.startsWith(rules.candidateSites.onlyIn)) continue;

    const excluded = find(rules.excluded, host);
    const why = excluded
      ? `${excluded.label} is excluded: ${excluded.reason}`
      : rules.candidateSites.domains.some((d) => matches(host, d))
        ? `campaign or party site: allowed only in ${rules.candidateSites.onlyIn}`
        : `${host} is not on the allowlist (content/sources.json)`;
    problems.push(`${rel} › ${path}\n    ${url}\n    → ${why}`);
  }

  for (const [path, label] of sourceLabels(data)) {
    if (/\bvia\b/i.test(label)) {
      problems.push(`${rel} › ${path}\n    label "${label}"\n    → "via": cite the dispatch on an allowed site instead`);
    }
    const named = rules.excluded.find((e) => label.toLowerCase().includes(e.label.toLowerCase()));
    if (named) problems.push(`${rel} › ${path}\n    label "${label}"\n    → names ${named.label}, which is excluded: ${named.reason}`);
  }
}

if (problems.length) {
  console.error(`\n✗ Sources check: ${problems.length} problem(s). Fix them or the build stops.\n`);
  console.error(problems.join("\n\n") + "\n");
  process.exit(1);
}
console.log(`✓ Sources check: ${checked} URLs, all on allowed sites.`);
