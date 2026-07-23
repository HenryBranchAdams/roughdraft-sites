import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const checkOnly = process.argv.includes("--check");
const canonicalUrl = new URL("../packages/rfm/src/index.ts", import.meta.url);
const copiedUrl = new URL(
  "../sites/roughdraft-collaboration/app/roughdraft-ui/rfm.ts",
  import.meta.url,
);
const manifestUrl = new URL(
  "../sites/roughdraft-collaboration/rfm-source.json",
  import.meta.url,
);
const canonical = await readFile(canonicalUrl);
const copied = await readFile(copiedUrl);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonicalHash = sha256(canonical);
const copiedHash = sha256(copied);

if (checkOnly) {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  if (canonicalHash !== copiedHash || manifest.sha256 !== canonicalHash) {
    console.error(
      `Sites RFM drift: canonical=${canonicalHash} copied=${copiedHash} manifest=${manifest.sha256}`,
    );
    process.exitCode = 1;
  } else {
    console.log(`Sites RFM parity verified: ${canonicalHash}`);
  }
} else {
  await writeFile(copiedUrl, canonical);
  await writeFile(
    manifestUrl,
    `${JSON.stringify(
      {
        format: "roughdraft-flavored-markdown",
        version: "0.2",
        canonicalSource: "packages/rfm/src/index.ts",
        copiedPath: "app/roughdraft-ui/rfm.ts",
        sha256: canonicalHash,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Synchronized Sites RFM source: ${canonicalHash}`);
}
