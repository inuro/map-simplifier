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

test("clicking a feature selects it; shift+click adds; Esc clears", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => document.body.dataset.mapReady === "true", null, {
    timeout: 30_000,
  });

  // 建物が多い zoom に寄せる
  await page.evaluate(() => {
    const g = window as unknown as { __mlMap?: { setZoom(z: number): void } };
    g.__mlMap?.setZoom(15);
  });
  await page.waitForFunction(
    () => {
      const g = window as unknown as {
        __mlMap?: {
          getZoom(): number;
          isStyleLoaded(): boolean;
          areTilesLoaded(): boolean;
        };
      };
      return (
        !!g.__mlMap &&
        Math.round(g.__mlMap.getZoom()) === 15 &&
        g.__mlMap.isStyleLoaded() &&
        g.__mlMap.areTilesLoaded()
      );
    },
    null,
    { timeout: 15_000 },
  );

  // 2 つの "異なる feature" にヒットする座標を事前に探しておく。
  // タイルごとに feature が異なるので、画面全体をスキャンして
  // top feature の geometry が異なる2点を見つける。
  const hits = await page.evaluate(() => {
    const g = window as unknown as {
      __mlMap?: {
        queryRenderedFeatures(
          p: [number, number],
          opts?: { layers?: string[] },
        ): Array<{ geometry: unknown; layer: { id: string } }>;
      };
    };
    const m = g.__mlMap!;
    const canvas = document.querySelector(".maplibregl-canvas") as HTMLElement;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const layers = [
      "waterarea-fill",
      "wstructurea-fill",
      "river-line",
      "railway-line",
      "road-line",
      "building-fill",
      "boundary-line",
    ];
    const seen = new Map<string, [number, number]>();
    for (let x = 40; x < cw && seen.size < 2; x += 30) {
      for (let y = 40; y < ch && seen.size < 2; y += 30) {
        const top = m.queryRenderedFeatures([x, y], { layers })[0];
        if (!top) continue;
        const key = JSON.stringify(top.geometry);
        if (!seen.has(key)) seen.set(key, [x, y]);
      }
    }
    return [...seen.values()];
  });
  expect(hits.length).toBe(2);
  const [p1, p2] = hits as [[number, number], [number, number]];

  // click payload を fire で流し込むヘルパ（shift 状態も込み）
  async function fireClick(
    pt: [number, number],
    shift: boolean,
  ): Promise<number> {
    return page.evaluate(
      ({ pt, shift }) => {
        const g = window as unknown as {
          __mlMap?: {
            unproject(p: [number, number]): unknown;
            fire(ev: string, payload: unknown): void;
            getSource(id: string): unknown;
          };
        };
        const m = g.__mlMap!;
        const lngLat = m.unproject(pt);
        m.fire("click", {
          point: { x: pt[0], y: pt[1] },
          lngLat,
          originalEvent: new MouseEvent("click", { shiftKey: shift }),
        });
        const src = m.getSource("selection-overlay") as
          | { _data?: { features?: unknown[] } }
          | undefined;
        return src?._data?.features?.length ?? 0;
      },
      { pt, shift },
    );
  }

  // 1. p1 を click → 選択数 1
  const n1 = await fireClick(p1, false);
  expect(n1).toBe(1);

  // 2. p2 を shift+click → 選択数 2
  const n2 = await fireClick(p2, true);
  expect(n2).toBe(2);

  // 3. Esc で解除 → 0
  await page.keyboard.press("Escape");
  const final = await page.evaluate(() => {
    const g = window as unknown as { __mlMap?: { getSource(id: string): unknown } };
    const src = g.__mlMap?.getSource("selection-overlay") as
      | { _data?: { features?: unknown[] } }
      | undefined;
    return src?._data?.features?.length ?? 0;
  });
  expect(final).toBe(0);
});

test("select → delete → undo → redo cycles the hidden overlay", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => document.body.dataset.mapReady === "true", null, {
    timeout: 30_000,
  });

  await page.evaluate(() => {
    const g = window as unknown as { __mlMap?: { setZoom(z: number): void } };
    g.__mlMap?.setZoom(15);
  });
  await page.waitForFunction(
    () => {
      const g = window as unknown as {
        __mlMap?: {
          getZoom(): number;
          isStyleLoaded(): boolean;
          areTilesLoaded(): boolean;
        };
      };
      return (
        !!g.__mlMap &&
        Math.round(g.__mlMap.getZoom()) === 15 &&
        g.__mlMap.isStyleLoaded() &&
        g.__mlMap.areTilesLoaded()
      );
    },
    null,
    { timeout: 15_000 },
  );

  // 選択用に1点探す
  const pt = await page.evaluate(() => {
    const g = window as unknown as {
      __mlMap?: {
        queryRenderedFeatures(
          p: [number, number],
          opts?: { layers?: string[] },
        ): Array<{ geometry: unknown }>;
      };
    };
    const m = g.__mlMap!;
    const canvas = document.querySelector(".maplibregl-canvas") as HTMLElement;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const layers = [
      "waterarea-fill",
      "wstructurea-fill",
      "river-line",
      "railway-line",
      "road-line",
      "building-fill",
      "boundary-line",
    ];
    for (let x = 40; x < cw; x += 30) {
      for (let y = 40; y < ch; y += 30) {
        if (m.queryRenderedFeatures([x, y], { layers }).length > 0) return [x, y];
      }
    }
    return null;
  });
  expect(pt).not.toBeNull();
  const [x, y] = pt as [number, number];

  // 選択
  await page.evaluate(
    ({ x, y }) => {
      const g = window as unknown as {
        __mlMap?: {
          unproject(p: [number, number]): unknown;
          fire(ev: string, payload: unknown): void;
        };
      };
      const m = g.__mlMap!;
      m.fire("click", {
        point: { x, y },
        lngLat: m.unproject([x, y]),
        originalEvent: new MouseEvent("click"),
      });
    },
    { x, y },
  );

  const hiddenCount = async (): Promise<number> =>
    page.evaluate(() => {
      const g = window as unknown as { __mlMap?: { getSource(id: string): unknown } };
      const src = g.__mlMap?.getSource("hidden-overlay") as
        | { _data?: { features?: unknown[] } }
        | undefined;
      return src?._data?.features?.length ?? 0;
    });

  // 削除ボタン → 非表示1件、selection は空、リセット/undo 有効
  await page.locator("#delete").click();
  expect(await hiddenCount()).toBe(1);
  await expect(page.locator("#selection-count")).toHaveText("");
  await expect(page.locator("#undo")).toBeEnabled();
  await expect(page.locator("#redo")).toBeDisabled();

  // Undo → 非表示0件、Redo 有効
  await page.locator("#undo").click();
  expect(await hiddenCount()).toBe(0);
  await expect(page.locator("#redo")).toBeEnabled();
  await expect(page.locator("#undo")).toBeDisabled();

  // Redo → 非表示1件戻る
  await page.locator("#redo").click();
  expect(await hiddenCount()).toBe(1);
  await expect(page.locator("#undo")).toBeEnabled();
  await expect(page.locator("#redo")).toBeDisabled();
});

test("Delete key deletes selection; Cmd+Z undoes", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => document.body.dataset.mapReady === "true", null, {
    timeout: 30_000,
  });
  await page.evaluate(() => {
    const g = window as unknown as { __mlMap?: { setZoom(z: number): void } };
    g.__mlMap?.setZoom(15);
  });
  await page.waitForFunction(
    () => {
      const g = window as unknown as {
        __mlMap?: { getZoom(): number; isStyleLoaded(): boolean; areTilesLoaded(): boolean };
      };
      return (
        !!g.__mlMap &&
        Math.round(g.__mlMap.getZoom()) === 15 &&
        g.__mlMap.isStyleLoaded() &&
        g.__mlMap.areTilesLoaded()
      );
    },
    null,
    { timeout: 15_000 },
  );

  // 選択＋削除（Delete キー経由）
  const pt = await page.evaluate(() => {
    const g = window as unknown as {
      __mlMap?: {
        queryRenderedFeatures(p: [number, number], opts?: { layers?: string[] }): Array<unknown>;
      };
    };
    const m = g.__mlMap!;
    const canvas = document.querySelector(".maplibregl-canvas") as HTMLElement;
    for (let x = 40; x < canvas.clientWidth; x += 30) {
      for (let y = 40; y < canvas.clientHeight; y += 30) {
        if (
          m.queryRenderedFeatures([x, y], {
            layers: [
              "waterarea-fill",
              "wstructurea-fill",
              "river-line",
              "railway-line",
              "road-line",
              "building-fill",
              "boundary-line",
            ],
          }).length > 0
        )
          return [x, y];
      }
    }
    return null;
  });
  expect(pt).not.toBeNull();
  const [x, y] = pt as [number, number];

  await page.evaluate(
    ({ x, y }) => {
      const g = window as unknown as {
        __mlMap?: { unproject(p: [number, number]): unknown; fire(ev: string, payload: unknown): void };
      };
      const m = g.__mlMap!;
      m.fire("click", {
        point: { x, y },
        lngLat: m.unproject([x, y]),
        originalEvent: new MouseEvent("click"),
      });
    },
    { x, y },
  );

  const hidden = async (): Promise<number> =>
    page.evaluate(() => {
      const g = window as unknown as { __mlMap?: { getSource(id: string): unknown } };
      const src = g.__mlMap?.getSource("hidden-overlay") as
        | { _data?: { features?: unknown[] } }
        | undefined;
      return src?._data?.features?.length ?? 0;
    });

  await page.keyboard.press("Delete");
  expect(await hidden()).toBe(1);

  // Cmd+Z（Mac）/ Ctrl+Z（Linux/Windows）両方許容
  await page.keyboard.press(process.platform === "darwin" ? "Meta+KeyZ" : "Control+KeyZ");
  expect(await hidden()).toBe(0);
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
