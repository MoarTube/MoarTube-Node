import { afterEach, describe, expect, it } from "vitest";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const targets = ["coverage", "data", "dist"];
const fixtures: string[] = [];

function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "moartube-startup-"));
  fixtures.push(root);
  mkdirSync(path.join(root, "bin"));
  copyFileSync(
    "bin/check-node-version.js",
    path.join(root, "bin/check-node-version.js"),
  );
  copyFileSync(
    "bin/moartube-node-start",
    path.join(root, "bin/moartube-node-start"),
  );
  writeFileSync(path.join(root, "package.json"), '{"type":"module"}');
  for (const name of targets) {
    mkdirSync(path.join(root, name));
    writeFileSync(path.join(root, name, "old"), "old data");
  }
  return root;
}

function builder(root: string, content: string): void {
  mkdirSync(path.join(root, "src"));
  writeFileSync(path.join(root, "src/moartube-node.ts"), "");
  const dir = path.join(root, "node_modules/tsup/dist");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "cli-default.js"), content);
}

function start(
  root: string,
  args: string[] = [],
): ReturnType<typeof spawnSync> {
  return spawnSync(
    process.execPath,
    [path.join(root, "bin/moartube-node-start"), ...args],
    {
      cwd: tmpdir(),
      encoding: "utf8",
      timeout: 10_000,
    },
  );
}

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    // Only remove direct children created by mkdtempSync for this suite.
    if (
      path.dirname(root) !== path.resolve(tmpdir()) ||
      !path.basename(root).startsWith("moartube-startup-")
    ) {
      throw new Error(`Unexpected fixture path: ${root}`);
    }
    rmSync(root, { recursive: true, force: true });
  }
});

describe("startup launcher", () => {
  it("does not repeat cleanup or building in cluster workers", () => {
    const root = fixture();
    const app = `
      import cluster from 'node:cluster';
      import fs from 'node:fs';
      const marker = new URL('../data/provisioned', import.meta.url);
      if (cluster.isPrimary) {
        fs.mkdirSync(new URL('../data', import.meta.url));
        fs.writeFileSync(marker, 'ready');
        cluster.fork().on('exit', (code) => { process.exitCode = code ?? 1; });
      } else {
        if (!fs.existsSync(marker)) throw new Error('Worker removed provisioned data');
        console.log('worker started');
        process.disconnect();
      }
    `;
    builder(
      root,
      `
      const fs = require('node:fs');
      if (fs.existsSync('data')) throw new Error('Worker repeated build');
      fs.mkdirSync('dist');
      fs.writeFileSync('dist/moartube-node.js', ${JSON.stringify(app)});
    `,
    );
    const result = start(root, ["--clean"]);
    expect(result.status, String(result.stderr)).toBe(0);
    expect(String(result.stdout)).toContain("worker started");
    expect(existsSync(path.join(root, "data/provisioned"))).toBe(true);
  });

  it("cleans before building and starting with --clean", () => {
    const root = fixture();
    rmSync(path.join(root, "coverage"), { recursive: true });
    builder(
      root,
      `
      const fs = require('node:fs');
      for (const name of ${JSON.stringify(targets)}) {
        if (fs.existsSync(name)) throw new Error('Build started before cleanup: ' + name);
      }
      fs.mkdirSync('dist');
      fs.writeFileSync('dist/moartube-node.js', "console.log('client started');");
    `,
    );
    const result = start(root, ["--clean"]);
    expect(result.status, String(result.stderr)).toBe(0);
    expect(String(result.stdout)).toContain("client started");
    for (const name of targets)
      expect(existsSync(path.join(root, name, "old"))).toBe(false);
  });

  it.each([[], ["clean"]])(
    "keeps existing directories without --clean (%j)",
    (args) => {
      const root = fixture();
      writeFileSync(
        path.join(root, "dist/moartube-node.js"),
        "console.log('client started');",
      );
      expect(start(root, args).status).toBe(0);
      for (const name of targets)
        expect(existsSync(path.join(root, name, "old"))).toBe(true);
    },
  );

  it("does not start when the build fails", () => {
    const root = fixture();
    builder(root, "process.exit(2);");
    const result = start(root, ["--clean"]);
    expect(result.status).toBe(1);
    expect(String(result.stderr)).toContain("Node build failed (2)");
  });

  it("rejects clean without sources before deleting data", () => {
    const root = fixture();
    expect(start(root, ["--clean"]).status).toBe(1);
    for (const name of targets)
      expect(existsSync(path.join(root, name, "old"))).toBe(true);
  });
});
