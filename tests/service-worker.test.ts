import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("first worker install warms initial JS/CSS and branding before claiming clients", async () => {
  const listeners: Record<string, (event: unknown) => void> = {};
  const cached: string[] = [];
  let skipped = false;
  const cache = {
    addAll: async (paths: string[]) => { cached.push(...paths); },
    match: async () => new Response('<script src="/_next/static/chunks/app/page-123.js"></script><link href="/_next/static/css/456.css"/>'),
  };
  vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    self: { addEventListener: (name: string, fn: (event: unknown) => void) => { listeners[name] = fn; },
      skipWaiting: () => { skipped = true; } },
    caches: { open: async () => cache },
  });
  let installed: Promise<unknown> | undefined;
  listeners.install({ waitUntil: (promise: Promise<unknown>) => { installed = promise; } });
  await installed;
  assert.ok(cached.includes("/_next/static/chunks/app/page-123.js"));
  assert.ok(cached.includes("/_next/static/css/456.css"));
  assert.ok(cached.includes("/terranova-icon.png"));
  assert.equal(skipped, true);
});
