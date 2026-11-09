// 守护测试：模拟核心（src/core/）不得依赖 DOM / Canvas API。
// 这是"模拟与渲染严格解耦"的硬性检查（设计文档 v0.2 §3）。

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CORE_DIR = decodeURIComponent(new URL('.', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('模拟核心零 DOM 依赖', () => {
  const files = listTsFiles(CORE_DIR);
  expect(files.length).toBeGreaterThan(0);

  for (const file of files) {
    it(`${file.split(/[\\/]/).pop()} 不含 DOM/Canvas 引用`, () => {
      const src = readFileSync(file, 'utf8');
      const banned = /\b(document|window|HTMLCanvasElement|CanvasRenderingContext2D|requestAnimationFrame|addEventListener)\b/;
      expect(banned.test(src)).toBe(false);
    });
  }
});
