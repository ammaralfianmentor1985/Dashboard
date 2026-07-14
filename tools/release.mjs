#!/usr/bin/env node
// Deploy tool for a machine with NO git binary.
// Commits files to GitHub via GraphQL createCommitOnBranch (atomic, chunked),
// auto-stamps SW_VERSION into app/sw.js whenever app/ files ship,
// and supports --rollback <sha> via the REST Git Data API.
//
// Usage:
//   node tools/release.mjs --all [--branch app] [--message "..."] [--include-brief]
//   node tools/release.mjs [--branch app] [--message "..."] path1 path2 dir3 ...
//   node tools/release.mjs --rollback <sha> [--branch main]
//
// Run from the repo root (where netlify.toml lives).

import { execSync } from "node:child_process";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, posix, sep } from "node:path";
import { createHash } from "node:crypto";

const OWNER = "ammaralfianmentor1985";
const REPO = "Dashboard";
const API = "https://api.github.com";
const MAX_FILES_PER_COMMIT = 40;
const MAX_B64_PER_COMMIT = 3 * 1024 * 1024;
const ALL_ROOTS = ["netlify.toml", "netlify/functions", "app", "tools"];
const SKIP_ALWAYS = new Set(["app/data/brief.json"]); // routine-owned unless --include-brief

if (!existsSync("netlify.toml")) {
  console.error("Run from the repo root (netlify.toml not found in cwd).");
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return null;
  args.splice(i, 1);
  return true;
};
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  if (i === -1) return dflt;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};

const rollbackSha = opt("--rollback", null);
const branch = opt("--branch", rollbackSha ? "main" : "app");
const message = opt("--message", null);
const includeBrief = !!flag("--include-brief");
const all = !!flag("--all");

const token = execSync("gh auth token", { encoding: "utf8" }).trim();
if (!/^\w/.test(token)) {
  console.error("gh auth token failed — is gh logged in?");
  process.exit(1);
}

async function rest(method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "mentor-markets-release",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error(`REST ${method} ${path} -> ${r.status}: ${text.slice(0, 300)}`);
  return json;
}

async function gql(query, variables) {
  const r = await fetch(`${API}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "mentor-markets-release",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await r.json();
  if (json.errors?.length) {
    const err = new Error(json.errors.map((e) => e.message).join(" | "));
    err.gql = json.errors;
    throw err;
  }
  return json.data;
}

async function headOid(br) {
  const d = await gql(
    `query($o:String!,$r:String!,$q:String!){repository(owner:$o,name:$r){ref(qualifiedName:$q){target{oid}}}}`,
    { o: OWNER, r: REPO, q: `refs/heads/${br}` }
  );
  return d.repository.ref?.target?.oid || null;
}

// ---------- rollback ----------
if (rollbackSha) {
  const cur = await headOid(branch);
  if (!cur) { console.error(`Branch ${branch} not found`); process.exit(1); }
  const target = await rest("GET", `/repos/${OWNER}/${REPO}/commits/${rollbackSha}`);
  const tree = target.commit.tree.sha;
  const commit = await rest("POST", `/repos/${OWNER}/${REPO}/git/commits`, {
    message: `revert: restore tree of ${rollbackSha.slice(0, 7)}`,
    tree,
    parents: [cur],
  });
  await rest("PATCH", `/repos/${OWNER}/${REPO}/git/refs/heads/${branch}`, { sha: commit.sha });
  console.log(`ROLLBACK OK  ${branch} -> ${commit.sha}  (tree of ${rollbackSha.slice(0, 7)})`);
} else {
  await release();
}

async function release() {
// ---------- collect files ----------
function walk(p, out) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const e of readdirSync(p)) {
      if (e === "node_modules" || e.startsWith(".")) continue;
      walk(join(p, e), out);
    }
  } else {
    out.push(p);
  }
}

const inputs = all ? ALL_ROOTS.filter(existsSync) : args;
if (!inputs.length) { console.error("No paths given (or use --all)."); process.exit(1); }

let files = [];
for (const p of inputs) {
  if (!existsSync(p)) { console.error(`Missing path: ${p}`); process.exit(1); }
  walk(p, files);
}
files = [...new Set(files.map((f) => f.split(sep).join(posix.sep)))].sort();
if (!includeBrief) files = files.filter((f) => !SKIP_ALWAYS.has(f));

// ---------- SW_VERSION stamping ----------
const contents = new Map(); // path -> Buffer
for (const f of files) contents.set(f, readFileSync(f));

const shipsApp = files.some((f) => f.startsWith("app/"));
if (shipsApp && existsSync("app/sw.js")) {
  const appHash = createHash("sha256");
  for (const f of files.filter((x) => x.startsWith("app/"))) appHash.update(contents.get(f));
  const swSrcPath = "app/sw.js";
  const swSrc = (contents.get(swSrcPath) || readFileSync(swSrcPath)).toString("utf8");
  const version = `v${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${appHash.digest("hex").slice(0, 8)}`;
  const stamped = swSrc.replace(/const SW_VERSION = "[^"]*"/, `const SW_VERSION = "${version}"`);
  if (stamped === swSrc && !swSrc.includes(version)) {
    console.error('WARNING: SW_VERSION marker not found in app/sw.js — stamp skipped.');
  } else {
    contents.set(swSrcPath, Buffer.from(stamped, "utf8"));
    if (!files.includes(swSrcPath)) files.push(swSrcPath);
    console.log(`SW_VERSION -> ${version}`);
  }
}

// ---------- chunk + commit ----------
const additions = files.map((f) => {
  const b64 = contents.get(f).toString("base64");
  return { path: f, contents: b64, size: b64.length };
});

const chunks = [];
let cur = [];
let curSize = 0;
for (const a of additions) {
  if (a.size > MAX_B64_PER_COMMIT) { console.error(`File too large for one commit: ${a.path}`); process.exit(1); }
  if (cur.length >= MAX_FILES_PER_COMMIT || curSize + a.size > MAX_B64_PER_COMMIT) {
    chunks.push(cur); cur = []; curSize = 0;
  }
  cur.push(a); curSize += a.size;
}
if (cur.length) chunks.push(cur);

let head = await headOid(branch);
const baselineMain = await headOid("main");
if (!head) {
  if (!baselineMain) { console.error("main not found"); process.exit(1); }
  await rest("POST", `/repos/${OWNER}/${REPO}/git/refs`, { ref: `refs/heads/${branch}`, sha: baselineMain });
  head = baselineMain;
  console.log(`Created branch ${branch} from main @ ${baselineMain.slice(0, 7)}`);
}
console.log(`Baseline: ${branch} @ ${head.slice(0, 7)} | main @ ${baselineMain?.slice(0, 7)} | ${files.length} files in ${chunks.length} commit(s)`);

const MUT = `mutation($input:CreateCommitOnBranchInput!){createCommitOnBranch(input:$input){commit{oid url}}}`;
for (let i = 0; i < chunks.length; i++) {
  const part = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : "";
  const input = {
    branch: { repositoryNameWithOwner: `${OWNER}/${REPO}`, branchName: branch },
    message: { headline: (message || `app: release ${new Date().toISOString().slice(0, 16)}Z`) + part },
    expectedHeadOid: head,
    fileChanges: { additions: chunks[i].map(({ path, contents }) => ({ path, contents })) },
  };
  let d;
  try {
    d = await gql(MUT, { input });
  } catch (e) {
    if (/expected|head|match/i.test(String(e.message))) {
      console.log("Head moved (routine commit?) — refetching and retrying once…");
      head = await headOid(branch);
      input.expectedHeadOid = head;
      d = await gql(MUT, { input });
    } else {
      throw e;
    }
  }
  head = d.createCommitOnBranch.commit.oid;
  console.log(`Commit${part}: ${d.createCommitOnBranch.commit.url}`);
  if (i < chunks.length - 1) await new Promise((r) => setTimeout(r, 2000));
}
console.log(`DONE. ${branch} @ ${head.slice(0, 7)}  (rollback pointer: previous main ${baselineMain?.slice(0, 7)})`);
}
