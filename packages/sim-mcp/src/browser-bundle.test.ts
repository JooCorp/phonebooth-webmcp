import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const here = new URL('.', import.meta.url).pathname;

describe('SDK in a browser bundle', () => {
  test('client, server and both transports bundle for the browser and run', async () => {
    const outdir = mkdtempSync(join(tmpdir(), 'phonebooth-bundle-'));
    const build = await Bun.build({
      entrypoints: [join(here, 'browser-check.ts')],
      outdir,
      target: 'browser',
      format: 'esm',
      minify: false,
    });
    expect(build.success).toBe(true);
    const output = build.outputs.find((artifact) => artifact.path.endsWith('.js'));
    expect(output).toBeDefined();
    const code = await output!.text();
    expect(code).not.toMatch(/from\s*["']node:/);
    expect(code).not.toMatch(/require\(["']node:/);
    expect(code).not.toMatch(/from\s*["'](fs|path|crypto|http|https|net|child_process|stream|events|os|url)["']/);

    const bundled = (await import(output!.path)) as typeof import('./browser-check.ts');
    expect(typeof bundled.transportClass).toBe('function');
    const outcome = await bundled.roundTrip();
    expect(outcome.toolCount).toBe(15);
    expect(outcome.status).toBe('thinking');
  });
});
