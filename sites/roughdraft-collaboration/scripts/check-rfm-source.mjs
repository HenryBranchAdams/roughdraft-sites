import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(
  await readFile(new URL("../rfm-source.json", import.meta.url), "utf8"),
);
const copied = await readFile(
  new URL(`../${manifest.copiedPath}`, import.meta.url),
);
const actual = createHash("sha256").update(copied).digest("hex");

if (actual !== manifest.sha256) {
  console.error(
    `RFM source drift: expected ${manifest.sha256}, received ${actual}.`,
  );
  process.exitCode = 1;
} else {
  console.log(`RFM source verified: ${actual}`);
}
