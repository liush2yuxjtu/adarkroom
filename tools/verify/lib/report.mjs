import fs from "node:fs";
import path from "node:path";

export function emptySuite(name) {
  return {
    name,
    pass: true,
    checks: 0,
    failures: [],
    warnings: [],
    results: []
  };
}

export function fail(suite, check) {
  suite.pass = false;
  suite.checks += 1;
  suite.failures.push(check);
  suite.results.push({ ok: false, ...check });
}

export function ok(suite, check) {
  suite.checks += 1;
  suite.results.push({ ok: true, ...check });
}

export function warn(suite, check) {
  suite.warnings.push(check);
  suite.results.push({ ok: true, warning: true, ...check });
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function summarize(suites, extra = {}) {
  const list = Array.isArray(suites) ? suites : Object.values(suites);
  const pass = list.every((s) => s && s.pass);
  const failures = list.flatMap((s) => (s.failures || []).map((f) => ({ suite: s.name, ...f })));
  return {
    pass,
    exitCode: pass ? 0 : 1,
    at: new Date().toISOString(),
    failed: failures.length,
    warnings: list.reduce((n, s) => n + (s.warnings || []).length, 0),
    suites: Object.fromEntries(list.map((s) => [s.name, { pass: s.pass, checks: s.checks, failed: s.failures.length }])),
    failures,
    ...extra
  };
}

export function printHuman(summary) {
  const mark = summary.pass ? "PASS" : "FAIL";
  console.error(`[verify] ${mark}  failed=${summary.failed}  warnings=${summary.warnings}`);
  for (const f of summary.failures.slice(0, 40)) {
    console.error(`  - [${f.suite}] ${f.id || f.kind}: ${f.detail || f.message || JSON.stringify(f)}`);
  }
  if (summary.failures.length > 40) {
    console.error(`  … ${summary.failures.length - 40} more`);
  }
}
