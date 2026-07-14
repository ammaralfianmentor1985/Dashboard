#!/usr/bin/env node
// Post-deploy smoke checker.
//
// Usage:
//   node tools/verify-live.mjs snapshot [--base URL] [--baseline FILE]   # save root-page baseline hash
//   node tools/verify-live.mjs [--base URL] [--baseline FILE]            # run all checks
//
// Default base = production. Pass --base https://deploy-preview-N--stately-pegasus-34152a.netlify.app
// to smoke-test a PR preview. Exits 1 if any critical check fails.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const argv = process.argv.slice(2);
const mode = argv[0] === "snapshot" ? "snapshot" : "verify";
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i === -1 ? dflt : argv[i + 1];
};
const BASE = (opt("--base", "https://stately-pegasus-34152a.netlify.app")).replace(/\/$/, "");
const BASELINE = opt("--baseline", join(tmpdir(), "mentor-markets-root-baseline.json"));

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

async function get(path, timeout = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`${BASE}${path}`, { signal: ctl.signal, headers: { "User-Agent": "verify-live" } });
    const body = Buffer.from(await r.arrayBuffer());
    return { status: r.status, body, headers: r.headers };
  } finally {
    clearTimeout(t);
  }
}

if (mode === "snapshot") {
  const r = await get("/");
  if (r.status !== 200) {
    console.error(`snapshot failed: / -> ${r.status}`);
    process.exitCode = 1;
  } else {
    writeFileSync(BASELINE, JSON.stringify({ base: BASE, hash: sha(r.body), len: r.body.length, at: new Date().toISOString() }));
    console.log(`Baseline saved: ${BASELINE}  (${r.body.length} bytes, ${sha(r.body).slice(0, 12)}…)`);
  }
} else {
  await runChecks();
}

async function runChecks() {

const results = [];
const check = (name, pass, note = "", critical = true) => {
  results.push({ name, pass, note, critical });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${note ? "  — " + note : ""}`);
};

// 1. Root page intact
try {
  const r = await get("/");
  let note = `${r.status}, ${r.body.length}B`;
  let pass = r.status === 200;
  if (pass && existsSync(BASELINE)) {
    const b = JSON.parse(readFileSync(BASELINE, "utf8"));
    const same = b.hash === sha(r.body);
    note += same ? ", hash matches baseline" : `, HASH MISMATCH vs baseline ${b.at}`;
    pass = same;
  }
  check("root briefing page", pass, note);
} catch (e) { check("root briefing page", false, e.message); }

// 2. A known briefing artifact still served
try {
  let latest = "briefings/market-update-2026-07-13.html";
  if (existsSync("briefings")) {
    const htmls = readdirSync("briefings").filter((f) => f.endsWith(".html")).sort();
    if (htmls.length) latest = "briefings/" + htmls[htmls.length - 1];
  }
  const r = await get("/" + encodeURI(latest));
  check("briefing artifact", r.status === 200, `${latest} -> ${r.status}`);
} catch (e) { check("briefing artifact", false, e.message); }

// 3. App shell
try {
  const r = await get("/app/");
  check("app shell", r.status === 200 && r.body.toString("utf8").includes("Mentor Markets"), `${r.status}`);
} catch (e) { check("app shell", false, e.message); }

// 4. chart op (keyless path)
try {
  const r = await get("/api/yahoo?op=chart&symbol=AAPL&range=5d&interval=1d");
  const j = JSON.parse(r.body.toString("utf8"));
  check("api chart", j.ok === true && j.data?.meta?.symbol === "AAPL", `src=${j.src}, price=${j.data?.meta?.regularMarketPrice}`);
} catch (e) { check("api chart", false, e.message); }

// 5. summary op (crumb path — the R1 go/no-go)
try {
  const r = await get("/api/yahoo?op=summary&symbol=AAPL");
  const j = JSON.parse(r.body.toString("utf8"));
  check("api summary (crumb)", j.ok === true && !!j.data?.financialData, `roe=${j.data?.financialData?.returnOnEquity?.raw}`);
} catch (e) { check("api summary (crumb)", false, e.message); }

// 6. quote op batch
try {
  const r = await get("/api/yahoo?op=quote&symbols=AAPL,BBCA.JK,GC=F");
  const j = JSON.parse(r.body.toString("utf8"));
  check("api quote x3", j.ok === true && j.data?.length === 3, `src=${j.src}${j.degraded ? " DEGRADED" : ""}`);
} catch (e) { check("api quote x3", false, e.message); }

// 7. calendar (best-effort)
try {
  const r = await get("/api/calendar");
  const j = JSON.parse(r.body.toString("utf8"));
  check("api calendar", j.ok === true || j.degraded === true, j.ok ? `${j.data.length} events` : "degraded", false);
} catch (e) { check("api calendar", false, e.message, false); }

// 8. CDN cache warm hit
try {
  await get("/api/yahoo?op=chart&symbol=MSFT&range=5d&interval=1d");
  await new Promise((r) => setTimeout(r, 800));
  const r2 = await get("/api/yahoo?op=chart&symbol=MSFT&range=5d&interval=1d");
  const cs = r2.headers.get("cache-status") || "";
  check("cdn cache hit", /hit/i.test(cs), cs || "no cache-status header", false);
} catch (e) { check("cdn cache hit", false, e.message, false); }

const failed = results.filter((r) => !r.pass);
const critical = failed.filter((r) => r.critical);
console.log(`\n${results.length - failed.length}/${results.length} passed${critical.length ? `  — ${critical.length} CRITICAL FAILURE(S)` : ""}`);
process.exitCode = critical.length ? 1 : 0;
}
