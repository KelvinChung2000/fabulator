import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';
const LOCAL_FILE = pathToFileURL(path.resolve(__dirname, '../../src/webview/ui/visual-harness.html')).toString();

async function wait(ms:number){ return new Promise(r=>setTimeout(r,ms)); }

async function zoom(page, action: 'in' | 'out' | 'fit' | 'reset', times=1) {
  for (let i=0;i<times;i++) {
    await page.click(`#controls button[data-action="${action === 'in' ? 'zoomIn' : action === 'out' ? 'zoomOut' : action}"]`);
    await wait(120);
  }
}

test.describe('Fabric zoom LOD transitions', () => {
  test('capture several zoom stages', async ({ page }) => {
  // Build latest webview bundle before navigating
  execSync('npm run build:webview', { stdio: 'inherit' });
  const target = process.env.PLAYWRIGHT_TEST_BASE_URL ? '/visual-harness.html' : LOCAL_FILE;
  await page.goto(target);
    await page.waitForSelector('#controls');

    // Initial (LOW)
    await page.screenshot({ path: 'tests/visual/__screenshots__/zoom-0-initial.png' });

    await zoom(page,'in',2); // toward MEDIUM
    await page.screenshot({ path: 'tests/visual/__screenshots__/zoom-1-medium-ish.png' });

    await zoom(page,'in',3); // toward HIGH
    await page.screenshot({ path: 'tests/visual/__screenshots__/zoom-2-high-ish.png' });

    await zoom(page,'in',3); // toward ULTRA
    await page.screenshot({ path: 'tests/visual/__screenshots__/zoom-3-ultra-ish.png' });

    await zoom(page,'reset');
  });
});
