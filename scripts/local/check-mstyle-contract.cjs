"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { stateDir } = require("./config.cjs");
const theme =
  process.env.MSTYLE_THEME_PATH ||
  "C:/Работа/Kwork/mstyle.na4u.ru/wp-content/themes/tf-mstyle-theme";
const php = process.env.PHP_BINARY || "C:/php/php.exe";
const result = spawnSync(
  php,
  [
    path.join(__dirname, "mstyle-contract-check.php"),
    theme,
    path.join(stateDir, "stage1-http.json"),
  ],
  { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true },
);
if (result.error) throw result.error;
if (result.stderr) process.stderr.write(result.stderr);
const report = JSON.parse(result.stdout);
fs.writeFileSync(
  path.join(stateDir, "mstyle-contract-result.json"),
  JSON.stringify(report, null, 2),
);
if (result.status !== 0) {
  console.error(
    JSON.stringify(
      { failures: report.failures, sourceLinks: report.sourceLinks },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} else {
  const byKind = {};
  for (const check of report.checks)
    byKind[check.kind] = (byKind[check.kind] || 0) + 1;
  console.log(
    "PASS: actual Mstyle PHP validators (" +
      report.checks.length +
      " responses/events, 4 sourceLinks checks)",
  );
  console.log(JSON.stringify(byKind));
}
