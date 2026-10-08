import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { resolve, join, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
const root = process.cwd();
const target = resolve(".sites-runtime/export-app");
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const item of [
  "app",
  "components",
  "lib",
  "public",
  "package.json",
  "tsconfig.json",
  "next.config.mjs",
  "tailwind.config.ts",
  "postcss.config.mjs",
])
  await cp(join(root, item), join(target, item), { recursive: true });
// Keep the original Next.js API untouched; the worker imports its shared handler.
await rm(join(target, "app/api"), { recursive: true, force: true });
await symlink(join(root, "node_modules"), join(target, "node_modules"), "dir");
execFileSync(
  process.execPath,
  [join(root, "node_modules/next/dist/bin/next"), "build"],
  {
    cwd: target,
    stdio: "inherit",
    env: { ...process.env, SITE_EXPORT: "1", NEXT_TELEMETRY_DISABLED: "1" },
  },
);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
const assets = {};
async function walk(dir, prefix = "") {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + "/" + entry.name;
    if (entry.isDirectory()) await walk(join(dir, entry.name), name);
    else if (!entry.name.endsWith(".map"))
      assets[name] = [
        mime[extname(entry.name)] || "application/octet-stream",
        (await readFile(join(dir, entry.name))).toString("base64"),
      ];
  }
}
await walk(join(target, "out"));
await writeFile(
  ".sites-runtime/assets.ts",
  "export const assets:Record<string,[string,string]>=" +
    JSON.stringify(assets) +
    ";",
);
await rm("dist", { recursive: true, force: true });
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await build({
  entryPoints: ["scripts/worker-entry.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
});
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
console.log(
  `Sites Worker listo: ${Object.keys(assets).length} recursos y API de visión.`,
);
