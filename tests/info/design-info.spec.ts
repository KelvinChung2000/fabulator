import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/** Dump design stats + first few nets */

test('dump design diagnostics', async ({ page, baseURL }) => {
  await page.goto(baseURL + '/visual-harness.html');
  await page.waitForSelector('#controls');
  // Allow optional design fetch
  await page.waitForTimeout(500);

  const info = await page.evaluate(() => {
    const api: any = (window as any).__fabulator;
  if (!api) { return { error: 'no api' }; }
    const stats = api.getDesignStats && api.getDesignStats();
    const nets = api.listNets ? api.listNets().slice(0, 25) : [];
    const firstNet = nets.length ? api.getNet(nets[0]) : null;
    return { stats, netCount: nets.length, sampleNets: nets, firstNetName: nets[0] || null, firstNet };
  });

  const outDir = path.resolve(__dirname, '../../diagnostics');
  if (!fs.existsSync(outDir)) { fs.mkdirSync(outDir, { recursive: true }); }
  const outFile = path.join(outDir, 'design-info.json');
  fs.writeFileSync(outFile, JSON.stringify(info, null, 2));
  console.log('Design diagnostics written to', outFile, info);

  // It's okay if no design loaded (optional); just assert structure
  expect(info).toHaveProperty('stats');
});
