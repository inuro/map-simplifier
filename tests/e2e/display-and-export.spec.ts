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
  expect(suggested).toMatch(/^map-simplifier-\d{8}-\d{6}\.png$/);
});

test("preset toggle switches style name and keeps canvas visible", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => document.body.dataset.mapReady === "true", null, {
    timeout: 30_000,
  });

  // デフォルトは standard
  const initial = await page.evaluate(() => {
    const g = window as unknown as { __mlMap?: { getStyle(): { name?: string } } };
    return g.__mlMap?.getStyle().name ?? null;
  });
  expect(initial).toBe("map-simplifier-standard");

  // モノトーンへ切替
  const monoBtn = page.locator("#preset-mono");
  await expect(monoBtn).toBeVisible();
  await monoBtn.click();

  await page.waitForFunction(
    () => {
      const g = window as unknown as {
        __mlMap?: { getStyle(): { name?: string }; isStyleLoaded(): boolean };
      };
      return !!g.__mlMap?.isStyleLoaded() && g.__mlMap.getStyle().name === "map-simplifier-mono";
    },
    null,
    { timeout: 15_000 },
  );

  await expect(page.locator("#map canvas.maplibregl-canvas")).toBeVisible();

  // 標準に戻す
  await page.locator("#preset-standard").click();
  await page.waitForFunction(
    () => {
      const g = window as unknown as {
        __mlMap?: { getStyle(): { name?: string }; isStyleLoaded(): boolean };
      };
      return (
        !!g.__mlMap?.isStyleLoaded() && g.__mlMap.getStyle().name === "map-simplifier-standard"
      );
    },
    null,
    { timeout: 15_000 },
  );
});

test("clicking a feature hides it and reset clears the overlay", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => document.body.dataset.mapReady === "true", null, {
    timeout: 30_000,
  });

  // 東京駅周辺の建物が多いズームに寄せる（デフォルト13→15）
  await page.evaluate(() => {
    const g = window as unknown as {
      __mlMap?: { setZoom(z: number): void; once(ev: string, cb: () => void): void };
    };
    g.__mlMap?.setZoom(15);
  });
  await page.waitForFunction(
    () => {
      const g = window as unknown as { __mlMap?: { getZoom(): number; isStyleLoaded(): boolean; areTilesLoaded(): boolean } };
      return !!g.__mlMap && Math.round(g.__mlMap.getZoom()) === 15 && g.__mlMap.isStyleLoaded() && g.__mlMap.areTilesLoaded();
    },
    null,
    { timeout: 15_000 },
  );

  const canvas = page.locator("#map canvas.maplibregl-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not measured");

  // クリック候補点をいくつか試して、非表示化できる feature に当たるまで探す
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const attempts: Array<[number, number]> = [
    [cx, cy],
    [cx + 60, cy],
    [cx, cy + 60],
    [cx - 60, cy],
    [cx, cy - 60],
    [cx + 120, cy + 20],
  ];

  let clicked = 0;
  for (const [x, y] of attempts) {
    const before = await page.evaluate(() => {
      const g = window as unknown as {
        __mlMap?: {
          getSource(id: string): unknown;
        };
      };
      const src = g.__mlMap?.getSource("hidden-overlay") as
        | { _data?: { features?: unknown[] } }
        | undefined;
      return src?._data?.features?.length ?? 0;
    });
    await page.mouse.click(x, y);
    // MapLibre の click→queryRenderedFeatures→setData は同期的なので wait は最小
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => {
      const g = window as unknown as {
        __mlMap?: { getSource(id: string): unknown };
      };
      const src = g.__mlMap?.getSource("hidden-overlay") as
        | { _data?: { features?: unknown[] } }
        | undefined;
      return src?._data?.features?.length ?? 0;
    });
    if (after > before) {
      clicked = after;
      break;
    }
  }
  expect(clicked).toBeGreaterThan(0);

  // リセットで空に戻る
  await page.locator("#reset-edits").click();
  const finalCount = await page.evaluate(() => {
    const g = window as unknown as { __mlMap?: { getSource(id: string): unknown } };
    const src = g.__mlMap?.getSource("hidden-overlay") as
      | { _data?: { features?: unknown[] } }
      | undefined;
    return src?._data?.features?.length ?? 0;
  });
  expect(finalCount).toBe(0);
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
