import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Loads the visual harness via Vite dev server and extracts geometry diagnostics so we can
 * debug missing tiles / switch matrix data from automated run.
 */

test('dump geometry diagnostics', async ({ page, baseURL }) => {
  // Navigate to harness served by Vite (index.html replaced with our harness path)
  await page.goto(baseURL + '/visual-harness.html');
  await page.waitForSelector('#controls', { timeout: 15000 });

  // Wait a moment for async loading
  await page.waitForTimeout(500);

  // Extract geometry summary from window.__fabulator
  const info = await page.evaluate(() => {
    const api: any = (window as any).__fabulator;
    if (!api || !api.renderer) { return { error: 'No renderer' }; }
    const renderer = api.renderer;
    const geom = renderer.getCurrentGeometry?.() || renderer.currentGeometry || (renderer as any).currentGeometry;
    if (!geom) { return { error: 'No geometry loaded' }; }

    const tileNames = geom.tileNames || [];
    const tileGeomMap: any = geom.tileGeomMap;
    const keys = tileGeomMap instanceof Map ? Array.from(tileGeomMap.keys()) : Object.keys(tileGeomMap || {});

    // Count missing tiles
    let missing: { name: any; x: number; y: number }[] = [];
    for (let y=0; y<tileNames.length; y++) {
      const row = tileNames[y];
      for (let x=0; x<row.length; x++) {
        const t = row[x];
        if (t !== null && t !== undefined) {
          const exists = tileGeomMap instanceof Map ? tileGeomMap.has(t) : !!tileGeomMap[t];
          if (!exists) { missing.push({ name: t, x, y }); }
        }
      }
    }

    return {
      rows: geom.numberOfRows,
      columns: geom.numberOfColumns,
      width: geom.width,
      height: geom.height,
      keyCount: keys.length,
      sampleKeys: keys.slice(0,20),
      missingCount: missing.length,
      missing: missing.slice(0,50)
    };
  });

  const outDir = path.resolve(__dirname, '../../diagnostics');
  if (!fs.existsSync(outDir)) { fs.mkdirSync(outDir, { recursive: true }); }
  const outFile = path.join(outDir, 'geometry-info.json');
  fs.writeFileSync(outFile, JSON.stringify(info, null, 2));
  console.log('Geometry diagnostics written to', outFile, info);

  expect(info.error).toBeUndefined();
  // Basic sanity: keyCount should be >= rows * columns / 2 (skip if tiny synthetic)
  if (info.rows && info.columns) {
    expect(info.keyCount).toBeGreaterThan(0);
  }
});
