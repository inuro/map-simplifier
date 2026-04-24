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

test("coordinate input moves the map center and keeps the current zoom", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => document.body.dataset.mapReady === "true", null, {
    timeout: 30_000,
  });

  const beforeZoom = await page.evaluate(() => {
    const g = window as unknown as { __mlMap?: { getZoom(): number } };
    return g.__mlMap!.getZoom();
  });

  await page.locator("#goto-coordinate-input").fill("35.65858, 139.74543");
  await page.locator("#goto-coordinate button").click();

  await page.waitForFunction(
    () => {
      const g = window as unknown as {
        __mlMap?: { getCenter(): { lat: number; lng: number } };
      };
      const c = g.__mlMap!.getCenter();
      return Math.abs(c.lat - 35.65858) < 0.0001 && Math.abs(c.lng - 139.74543) < 0.0001;
    },
    null,
    { timeout: 5_000 },
  );
  await page.waitForFunction(
    () => /^#\d+(\.\d+)?\/35\.65858\/139\.74543$/.test(window.location.hash),
    null,
    { timeout: 5_000 },
  );

  const after = await page.evaluate(() => {
    const g = window as unknown as {
      __mlMap?: { getCenter(): { lat: number; lng: number }; getZoom(): number };
    };
    const c = g.__mlMap!.getCenter();
    return { lat: c.lat, lng: c.lng, zoom: g.__mlMap!.getZoom(), hash: window.location.hash };
  });
  expect(after.lat).toBeCloseTo(35.65858, 4);
  expect(after.lng).toBeCloseTo(139.74543, 4);
  expect(after.zoom).toBeCloseTo(beforeZoom, 5);
  expect(after.hash).toMatch(/^#\d+(\.\d+)?\/35\.65858\/139\.74543$/);
  await expect(page.locator("#goto-coordinate-input")).toHaveValue("35.65858, 139.74543");
  await expect(page.locator("#goto-coordinate-status")).toHaveText("移動しました");
});

test("coordinate input rejects invalid coordinates without moving", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => document.body.dataset.mapReady === "true", null, {
    timeout: 30_000,
  });

  const before = await page.evaluate(() => {
    const g = window as unknown as { __mlMap?: { getCenter(): { lat: number; lng: number } } };
    const c = g.__mlMap!.getCenter();
    return { lat: c.lat, lng: c.lng };
  });

  await page.locator("#goto-coordinate-input").fill("91, 139.767");
  await page.locator("#goto-coordinate button").click();

  await expect(page.locator("#goto-coordinate-input")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#goto-coordinate-status")).toHaveText("緯度, 経度で入力");

  const after = await page.evaluate(() => {
    const g = window as unknown as { __mlMap?: { getCenter(): { lat: number; lng: number } } };
    const c = g.__mlMap!.getCenter();
    return { lat: c.lat, lng: c.lng };
  });
  expect(after.lat).toBeCloseTo(before.lat, 8);
  expect(after.lng).toBeCloseTo(before.lng, 8);
});

test("layer visibility popover toggles building, water, and road edge layers", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => document.body.dataset.mapReady === "true", null, {
    timeout: 30_000,
  });

  await page.locator("#layer-visibility-toggle").click();
  await expect(page.locator("#layer-visibility-popover")).toBeVisible();

  await page.locator('input[data-layer-visibility="building"]').uncheck();
  await page.waitForFunction(() => {
    const g = window as unknown as {
      __mlMap?: { getLayoutProperty(id: string, prop: string): unknown };
    };
    return (
      g.__mlMap!.getLayoutProperty("building-fill", "visibility") === "none" &&
      g.__mlMap!.getLayoutProperty("building-outline-line", "visibility") === "none" &&
      g.__mlMap!.getLayoutProperty("structure-outline-line", "visibility") === "none" &&
      g.__mlMap!.getLayoutProperty("structure-fill", "visibility") === "none"
    );
  });

  await page.locator('input[data-layer-visibility="water"]').uncheck();
  const waterVisibility = await page.evaluate(() => {
    const g = window as unknown as {
      __mlMap?: { getLayoutProperty(id: string, prop: string): unknown };
    };
    return {
      waterarea: g.__mlMap!.getLayoutProperty("waterarea-fill", "visibility"),
      waterareaOutline: g.__mlMap!.getLayoutProperty("waterarea-outline-line", "visibility"),
      waterline: g.__mlMap!.getLayoutProperty("waterline-line", "visibility"),
      river: g.__mlMap!.getLayoutProperty("river-line", "visibility"),
    };
  });
  expect(waterVisibility).toEqual({
    waterarea: "none",
    waterareaOutline: "none",
    waterline: "none",
    river: "none",
  });

  await page.locator('input[data-layer-visibility="roadEdge"]').uncheck();
  const roadEdgeVisibility = await page.evaluate(() => {
    const g = window as unknown as {
      __mlMap?: { getLayoutProperty(id: string, prop: string): unknown };
    };
    return {
      center: g.__mlMap!.getLayoutProperty("road-line", "visibility"),
      edge: g.__mlMap!.getLayoutProperty("road-edge-line", "visibility"),
      component: g.__mlMap!.getLayoutProperty("road-component-line", "visibility"),
    };
  });
  expect(roadEdgeVisibility).toEqual({
    center: "visible",
    edge: "none",
    component: "none",
  });

  await page.locator('input[data-layer-visibility="building"]').check();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const g = window as unknown as {
          __mlMap?: { getLayoutProperty(id: string, prop: string): unknown };
        };
        return g.__mlMap!.getLayoutProperty("building-fill", "visibility");
      }),
    )
    .toBe("visible");
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
      "waterarea-outline-line",
      "waterline-line",
      "river-line",
      "railway-line",
      "rail-track-line",
      "road-line",
      "road-edge-line",
      "road-component-line",
      "building-fill",
      "building-outline-line",
      "structure-fill",
      "structure-outline-line",
      "boundary-line",
      "adminarea-boundary-line",
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

test("select → delete → undo → redo cycles the hidden list (feature-state)", async ({ page }) => {
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
      "waterarea-outline-line",
      "waterline-line",
      "river-line",
      "railway-line",
      "rail-track-line",
      "road-line",
      "road-edge-line",
      "road-component-line",
      "building-fill",
      "building-outline-line",
      "structure-fill",
      "structure-outline-line",
      "boundary-line",
      "adminarea-boundary-line",
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
      const g = window as unknown as {
        __editState?: { state: { hidden: unknown[] } };
      };
      return g.__editState?.state.hidden.length ?? 0;
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
              "waterarea-outline-line",
              "waterline-line",
              "river-line",
              "railway-line",
              "rail-track-line",
              "road-line",
              "road-edge-line",
              "road-component-line",
              "building-fill",
              "building-outline-line",
              "structure-fill",
              "structure-outline-line",
              "boundary-line",
              "adminarea-boundary-line",
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
      const g = window as unknown as {
        __editState?: { state: { hidden: unknown[] } };
      };
      return g.__editState?.state.hidden.length ?? 0;
    });

  await page.keyboard.press("Delete");
  expect(await hidden()).toBe(1);

  // Cmd+Z（Mac）/ Ctrl+Z（Linux/Windows）両方許容
  await page.keyboard.press(process.platform === "darwin" ? "Meta+KeyZ" : "Control+KeyZ");
  expect(await hidden()).toBe(0);
});

test("select → 強調 → toggle off → undo restores", async ({ page }) => {
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
              "waterarea-outline-line",
              "waterline-line",
              "river-line",
              "railway-line",
              "rail-track-line",
              "road-line",
              "road-edge-line",
              "road-component-line",
              "building-fill",
              "building-outline-line",
              "structure-fill",
              "structure-outline-line",
              "boundary-line",
              "adminarea-boundary-line",
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

  const highlightCount = async (): Promise<number> =>
    page.evaluate(() => {
      const g = window as unknown as { __mlMap?: { getSource(id: string): unknown } };
      const src = g.__mlMap?.getSource("highlight-overlay") as
        | { _data?: { features?: unknown[] } }
        | undefined;
      return src?._data?.features?.length ?? 0;
    });

  // 強調 → 1件
  await page.locator("#highlight").click();
  expect(await highlightCount()).toBe(1);
  await expect(page.locator("#undo")).toBeEnabled();

  // 再選択して強調 → 0件（toggle off）
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
  await page.locator("#highlight").click();
  expect(await highlightCount()).toBe(0);

  // Undo → 1件戻る
  await page.locator("#undo").click();
  expect(await highlightCount()).toBe(1);
});

test("deleting a highlighted selection removes the highlight overlay too", async ({ page }) => {
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

  const pt = await page.evaluate(() => {
    const g = window as unknown as {
      __mlMap?: {
        queryRenderedFeatures(p: [number, number], opts?: { layers?: string[] }): Array<unknown>;
      };
    };
    const m = g.__mlMap!;
    const canvas = document.querySelector(".maplibregl-canvas") as HTMLElement;
    const layers = [
      "waterarea-fill",
      "waterarea-outline-line",
      "waterline-line",
      "river-line",
      "railway-line",
      "rail-track-line",
      "road-line",
      "road-edge-line",
      "road-component-line",
      "building-fill",
      "building-outline-line",
      "structure-fill",
      "structure-outline-line",
      "boundary-line",
      "adminarea-boundary-line",
    ];
    for (let x = 40; x < canvas.clientWidth; x += 30) {
      for (let y = 40; y < canvas.clientHeight; y += 30) {
        if (m.queryRenderedFeatures([x, y], { layers }).length > 0) return [x, y];
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

  const counts = async (): Promise<{ hidden: number; highlighted: number }> =>
    page.evaluate(() => {
      const g = window as unknown as {
        __editState?: { state: { hidden: unknown[]; highlighted: unknown[] } };
      };
      return {
        hidden: g.__editState?.state.hidden.length ?? 0,
        highlighted: g.__editState?.state.highlighted.length ?? 0,
      };
    });

  await page.locator("#highlight").click();
  expect((await counts()).highlighted).toBe(1);

  await page.locator("#delete").click();
  expect(await counts()).toEqual({ hidden: 1, highlighted: 0 });
});

test("shift+drag rubber band selects multiple features", async ({ page }) => {
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

  // canvas に直接 MouseEvent を dispatch してラバーバンドを起動。
  // Playwright の keyboard.down('Shift') + mouse.down/move/up は MapLibre の
  // mousedown ハンドラに shiftKey=true を伝えない環境がある（実際本環境で確認）。
  // ここでは DOM レベルで同等の操作を再現する。
  const selected = await page.evaluate(() => {
    const canvas = document.querySelector(".maplibregl-canvas") as HTMLElement;
    const rect = canvas.getBoundingClientRect();
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;
    const size = 300;
    const p1 = { x: cx - size / 2, y: cy - size / 2 };
    const p2 = { x: cx + size / 2, y: cy + size / 2 };
    function mk(type: string, x: number, y: number): MouseEvent {
      return new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + x,
        clientY: rect.top + y,
        button: 0,
        shiftKey: true,
      });
    }
    canvas.dispatchEvent(mk("mousedown", p1.x, p1.y));
    canvas.dispatchEvent(mk("mousemove", (p1.x + p2.x) / 2, (p1.y + p2.y) / 2));
    canvas.dispatchEvent(mk("mousemove", p2.x, p2.y));
    canvas.dispatchEvent(mk("mouseup", p2.x, p2.y));
    const g = window as unknown as { __selectionStore?: { state: unknown[] } };
    return g.__selectionStore?.state.length ?? 0;
  });
  expect(selected).toBeGreaterThan(1);
});

test("layer popover combines visibility and per-layer line width controls", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => document.body.dataset.mapReady === "true", null, {
    timeout: 30_000,
  });

  // 初期 road line-width 式を取得
  const initialRoad = await page.evaluate(() => {
    const g = window as unknown as {
      __mlMap?: { getPaintProperty(id: string, prop: string): unknown };
    };
    return g.__mlMap!.getPaintProperty("road-line", "line-width");
  });
  // 初期は interpolate 式（配列形）で stop 値が [0.3, 1.0, 2.4]
  expect(Array.isArray(initialRoad)).toBe(true);

  // レイヤメニューに統合され、独立した「太さ…」メニューは持たない。
  await expect(page.locator("#line-width-toggle")).toHaveCount(0);
  await page.locator("#layer-visibility-toggle").click();
  await expect(page.locator("#layer-visibility-popover")).toBeVisible();
  await expect(page.locator('input[data-layer-visibility="roadEdge"]')).toBeVisible();
  await expect(page.locator('button[data-lw="roadEdge"][data-op="inc"]')).toBeVisible();
  await expect(page.locator('button[data-lw="building"][data-op="inc"]')).toBeVisible();

  // 道路を太く（×1.25）
  await page.locator('button[data-lw="road"][data-op="inc"]').click();
  const afterInc = await page.evaluate(() => {
    const g = window as unknown as {
      __mlMap?: { getPaintProperty(id: string, prop: string): unknown };
    };
    return g.__mlMap!.getPaintProperty("road-line", "line-width");
  });
  // stop 値が 1.25 倍になっていること
  // interpolate 式は ["interpolate", ["linear"], ["zoom"], z1, v1, z2, v2, ...] 。
  // 値stop は index 4, 6, 8, ... （3番目以降の偶数）。
  const stopsInc = (afterInc as unknown[]).slice(3).filter((_, i) => i % 2 === 1) as number[];
  expect(stopsInc[0]).toBeCloseTo(0.3 * 1.25, 5);
  expect(stopsInc[2]).toBeCloseTo(2.4 * 1.25, 5);

  // 表示ラベルも更新される
  await expect(page.locator('[data-lw-value="road"]')).toHaveText("1.25×");

  // 道路枠線も独立して太くできる
  await page.locator('button[data-lw="roadEdge"][data-op="inc"]').click();
  const roadEdge = await page.evaluate(() => {
    const g = window as unknown as {
      __mlMap?: { getPaintProperty(id: string, prop: string): unknown };
    };
    return {
      edge: g.__mlMap!.getPaintProperty("road-edge-line", "line-width"),
      component: g.__mlMap!.getPaintProperty("road-component-line", "line-width"),
    };
  });
  expect(roadEdge.edge).toBeCloseTo(0.55 * 1.25, 5);
  expect(roadEdge.component).toBeCloseTo(0.45 * 1.25, 5);
  await expect(page.locator('[data-lw-value="roadEdge"]')).toHaveText("1.25×");

  // 鉄道を細く
  await page.locator('button[data-lw="railway"][data-op="dec"]').click();
  const railway = await page.evaluate(() => {
    const g = window as unknown as {
      __mlMap?: { getPaintProperty(id: string, prop: string): unknown };
    };
    return g.__mlMap!.getPaintProperty("railway-line", "line-width");
  });
  expect(railway).toBeCloseTo(1.1 / 1.25, 5);

  // リセット
  await page.locator("#line-width-reset").click();
  await expect(page.locator('[data-lw-value="road"]')).toHaveText("1.00×");
  const reset = await page.evaluate(() => {
    const g = window as unknown as {
      __mlMap?: { getPaintProperty(id: string, prop: string): unknown };
    };
    return {
      road: g.__mlMap!.getPaintProperty("road-line", "line-width"),
      roadEdge: g.__mlMap!.getPaintProperty("road-edge-line", "line-width"),
      railway: g.__mlMap!.getPaintProperty("railway-line", "line-width"),
    };
  });
  const resetStops = (reset.road as unknown[]).slice(3).filter((_, i) => i % 2 === 1) as number[];
  expect(resetStops[0]).toBeCloseTo(0.3, 5);
  expect(reset.roadEdge).toBeCloseTo(0.55, 5);
  expect(reset.railway).toBeCloseTo(1.1, 5);
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
