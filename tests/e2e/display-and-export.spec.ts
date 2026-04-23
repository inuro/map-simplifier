import { expect, test } from "@playwright/test";

// 実タイル（国土地理院）への外部HTTPは Playwright 実行中は成功することもあれば
// ネットワーク環境で落ちることもある。ここでは「load」イベントが発火し map canvas
// が非空サイズで存在すること、PNG ダウンロードが発火すること、クレジットが
// DOM に含まれることを検証する。描画ピクセルそのものは検証しない。

test("map container renders and PNG export triggers a download", async ({ page }) => {
  await page.goto("/");

  await page.waitForFunction(() => document.body.dataset.mapReady === "true", null, {
    timeout: 30_000,
  });

  const canvas = page.locator("#map canvas.maplibregl-canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(100);
  expect(box!.height).toBeGreaterThan(100);

  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText(/地理院タイル|国土地理院/);

  const exportBtn = page.locator("#export-png");
  await expect(exportBtn).toBeEnabled();

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20_000 }),
    exportBtn.click(),
  ]);

  const suggested = download.suggestedFilename();
  expect(suggested).toMatch(/^simplemap-\d{8}-\d{6}\.png$/);
});

test("URL hash reflects view state after pan", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => document.body.dataset.mapReady === "true", null, {
    timeout: 30_000,
  });

  await page.evaluate(async () => {
    const g = globalThis as unknown as { __testHooks?: { flyTo?: (lng: number, lat: number) => void } };
    // 直接 map をいじれないため、pointer ドラッグで代用。
    // ここでは location.hash の更新を moveend が発火するパンで観測する。
    void g;
  });

  const canvas = page.locator("#map canvas.maplibregl-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not measured");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 80, startY + 40, { steps: 8 });
  await page.mouse.up();

  await page.waitForFunction(() => window.location.hash.startsWith("#"), null, { timeout: 5_000 });
  const hash = await page.evaluate(() => window.location.hash);
  expect(hash).toMatch(/^#\d+(\.\d+)?\/-?\d+(\.\d+)?\/-?\d+(\.\d+)?$/);
});
