import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
const files = (await readdir("release"))
  .filter((file) => /^Rowberry-.*\.(dmg|exe|AppImage|deb)$/.test(file))
  .sort();
if (!files.length) throw new Error("No release packages to checksum");
const lines = await Promise.all(
  files.map(
    async (file) =>
      `${createHash("sha256")
        .update(await readFile(`release/${file}`))
        .digest("hex")}  ${file}`,
  ),
);
await writeFile("release/SHA256SUMS", lines.join("\n") + "\n");
console.log(`Checksummed ${files.length} packages`);
