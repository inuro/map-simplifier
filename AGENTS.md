# map-simplifier

書籍原稿用の簡略化地図図版を作成するローカル Web アプリ。国土地理院ベクトルタイルをベースに、ブラウザ上で地物を選択・非表示・強調し、PNG として書き出す。

- **リポジトリ**: https://github.com/inuro/map-simplifier
- **バックログ**: GitHub Issues で管理する。
- **開発方針**: 仕様・設計が変わるときは、この `AGENTS.md` も更新する。単なる完了履歴や TODO 一覧はここに増やさず、Issue / PR に委ねる。

---

## 要件

書籍本文に差し込む「位置関係を示す地図図版」を、既存地図サービスのスクリーンショットより簡潔に作る。

1. 商業 POI・過剰な注記・多すぎる色を減らし、紙面で読みやすくする。
2. 本文で言及する道路・駅・建物・水域・境界など、必要な要素だけを残せるようにする。
3. 国土地理院タイルを利用し、出典表記を明確にする。
4. ズーム・範囲・残す要素を GUI で何度も調整できるようにする。

最終ゴールは、任意の位置・ズームの国土地理院地図から、要素を取捨選択・簡略化した PNG 図版を対話的に書き出すこと。

---

## 技術スタック

- **ランタイム**: ローカル Web アプリ
- **ビルド**: Vite + TypeScript
- **地図レンダラ**: MapLibre GL JS
- **タイルソース**: 国土地理院 `optimal_bvmap-v1`
- **単体テスト**: Vitest
- **E2E / UI 検証**: Playwright
- **パッケージマネージャ**: pnpm

実タイル URL:

```text
https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/{z}/{x}/{y}.pbf
```

MapLibre に直接渡すのではなく、`gsi-ids://` 独自プロトコル経由で feature id を注入してから読む。

### 環境メモ

- Node は `.nvmrc` の v22.18.0 を使う。Codex.app 同梱 Node だと Rollup の native module 読み込みで失敗することがある。
- リポジトリがクラウド同期ディレクトリ配下にあるため、`.npmrc` で pnpm の `virtual-store-dir` をリポジトリ外へ逃がしている。`node_modules` 周辺を変更するときはこの前提を壊さない。

---

## source-layer

`optimal_bvmap-v1` の実 source-layer は次の通り。`src/map/style.ts` と `src/state/layerVisibilityStore.ts` はこの名称を前提にしている。

| source-layer | ジオメトリ | 意味 | 主な UI カテゴリ |
| --- | --- | --- | --- |
| `WA` | Polygon | 水域 | 水域 |
| `WL` | LineString | 水涯線 | 水域 |
| `RvrCL` | LineString | 河川中心線 | 水域 |
| `RdCL` | LineString | 道路中心線 | 道路中心線 |
| `RdEdg` | LineString | 道路縁 | 道路枠線 |
| `RdCompt` | LineString | 道路構成線 | 道路枠線 |
| `RailCL` | LineString | 鉄道中心線 | 鉄道 |
| `RailTrCL` | LineString | 軌道中心線 | 鉄道 |
| `BldA` | Polygon | 建物 | 建物 |
| `StrctArea` | Polygon | 構造物面 | 建物 |
| `AdmBdry` | LineString | 行政界 | 行政界 |
| `AdmArea` | Polygon | 行政区域 | 行政界 |
| `Anno` | Point | 注記 | 現時点では非表示 |

---

## アーキテクチャ概略

```text
src/
  main.ts                    # MapLibre 初期化、UI 配線、編集アクション
  export/
    png.ts                   # MapLibre canvas から PNG 書き出し
  map/
    gsiSource.ts             # GSI vector source 定義、出典クレジット
    idProtocol.ts            # gsi-ids:// protocol。tile 座標 + tile 内連番で feature.id 注入
    style.ts                 # standard / mono style、hideable layer、基準 line-width
    hiddenSync.ts            # editState.hidden と MapLibre feature-state の同期
    selectionOverlay.ts      # 選択 feature の橙 overlay
    highlightOverlay.ts      # 強調 feature の overlay
    rubberBand.ts            # Shift+drag 矩形選択
    layerVisibility.ts       # UI カテゴリごとの表示/非表示を MapLibre layer に反映
    lineWidth.ts             # UI カテゴリごとの line-width factor を paint に反映
    zoomLock.ts              # 編集中の整数ズーム帯ロック
    featureBounds.ts         # geometry bbox / union / expand
    featureDistance.ts       # クリック hit 判定用の screen 距離
    featureIdentity.ts       # 「選択以外を削除」時の tile partial 保護
  state/
    viewState.ts             # URL hash の view state encode/decode
    editState.ts             # hidden / highlighted store + snapshot/restore
    selectionStore.ts        # 選択中 feature store
    history.ts               # snapshot-based Undo/Redo
    latLngInput.ts           # 緯度経度入力の parse / format
    layerVisibilityStore.ts  # レイヤ表示カテゴリ store
    lineWidthStore.ts        # レイヤ別 line-width factor store
    projectSnapshot.ts       # Save/Load/Export/Import 用 JSON snapshot
    projectStorage.ts        # IndexedDB 保存
    reverseGeocode.ts        # 保存名候補用の GSI 逆ジオコーディング
  types/
    globals.d.ts
    vt-pbf.d.ts
scripts/
  inspect-tile.mjs           # 実タイル解析用
tests/
  unit/                      # Vitest
  e2e/                       # Playwright
.github/workflows/ci.yml     # typecheck + unit test
```

---

## 主要な設計判断

### feature id 注入

国土地理院ベクトルタイルには feature id がないため、MapLibre の `feature-state` をそのまま使えない。

`src/map/idProtocol.ts` は `gsi-ids://` protocol を登録し、実 pbf を取得してから `@mapbox/vector-tile` で parse し、各 feature に `tile z/x/y + tile 内 feature index` から作った safe integer id を注入して `vt-pbf` で再エンコードする。

この id は sourceLayer 内で tile をまたいでも衝突しない。ただし、tile 境界で分割された同一論理 feature に同じ id が付くわけではない。tile 跨ぎ同一性は引き続き geometry / properties / tile 境界近接判定で扱う。

### 非表示は feature-state

削除はデータを消すのではなく、`editState.hidden` に登録し、MapLibre feature-state `hidden=true` を同期して opacity 0 にする。

- `style.ts` の hideable layer は `feature-state.hidden` が true のとき `fill-opacity` / `line-opacity` を 0 にする。
- `hiddenSync.ts` は `load` / `styledata` / `sourcedata` / `idle` / `editState` 変更時に現在 rendered な feature を走査し、`sourceLayer + geometry` が hidden と一致する feature に `setFeatureState` を適用する。
- `queryRenderedFeatures` は opacity 0 の feature も返すため、クリック/ホバー/矩形選択側では `editState.isHidden()` と layer visibility で明示的に除外する。

### 選択モデル

`click = 単一選択`、`Shift+click = toggle`、`Shift+drag = 矩形追加選択`。削除・強調・選択以外を削除は選択状態に対して作用する。

クリック hit は点 query ではなく小さな bbox query を使い、線 feature は `featureDistance.ts` で screen 距離が最も近いものを選ぶ。MapLibre の `queryRenderedFeatures` は `[x, y]` 配列または bbox を渡すこと。`{x, y}` オブジェクトを渡すと options と誤解釈されるので避ける。

### 選択以外を削除

「選択以外を削除」は、選択 feature 群の lng-lat bbox を中心基準で線形 2 倍に広げ、その範囲内の hideable feature から選択対象と同一論理 feature の tile partial を保護し、それ以外を hidden に入れる。

partial 保護は `featureIdentity.ts` が担当する。単なる properties 完全一致だけでは同種の別建物などを過剰保護するため、sourceLayer/properties 一致に加えて、現在 source tile 境界付近で geometry が接続していることを条件にする。

### ズームロック

hidden / highlighted のどちらかが非空の間は編集状態とみなし、ズームを現在の整数ズーム帯に制限する。

例: `Z 16.35` で編集が始まった場合、`16.0 <= Z < 17.0` の範囲だけ許可する。整数ズーム段を跨ぐと同一論理 feature の geometry が simplify され、`editState` の追跡が崩れるため。

ロック中も同じ整数ズーム帯の中では表示倍率を微調整できる。編集をリセットして hidden / highlighted が空になると、元の minZoom / maxZoom に戻す。

### レイヤ表示と太さ

「レイヤ...」メニューは、カテゴリごとに表示/非表示と line-width factor をまとめて扱う。

カテゴリ:

- 水域
- 道路中心線
- 道路枠線
- 鉄道
- 建物
- 行政界

line-width factor は view 設定扱いで、Undo/Redo には乗せない。preset 切替や styledata 後に再適用する。

### Overlay と preset

描画順は base map（feature-state hidden 適用済み）→ highlight overlay → selection overlay。preset 切替は `map.setStyle(..., { diff: true })` で custom overlay を落とすことがあるため、`styledata` と `idle` で overlay / layer visibility / line width / hidden state を復元する。

### Undo/Redo

`History<T>` は snapshot ベース。`editState.snapshot()` / `restore()` を履歴対象にする。選択状態、view state、preset、layer visibility、line-width factor は Undo/Redo 対象外。

### Save / Load / Export / Import

現在位置・ズーム、preset、layer visibility、line-width factor、hidden/highlighted feature を `ProjectSnapshot` JSON として保存する。

- Save/Load は IndexedDB (`map-simplifier` / `project-snapshots`) を使う。localStorage より容量に余裕があるため、多数の hidden feature を含む JSON でも詰まりにくい。
- Save は保存名を `prompt()` で確認する。初期値は国土地理院の逆ジオコーダ `LonLatToAddress` の `lv01Nm` を使い、失敗時は座標にフォールバックする。
- Export/Import は同じ JSON 形式を `.map-simplifier.json` ファイルとして扱う。
- Import/Load 後は選択状態と Undo/Redo 履歴をクリアする。編集内容そのものは snapshot から復元する。

---

## 既知の制約

- feature 同一性は最終的には `sourceLayer + geometry` に依存する。整数ズーム段を跨ぐと geometry が変わるため、編集状態が維持できない。これを避けるため、編集中は整数ズーム帯ロックを行う。
- tile 跨ぎの同一論理 feature に完全なグローバル ID はない。`idProtocol.ts` の id は feature-state の飛び火を防ぐための tile-scoped id であり、永続 ID ではない。
- Playwright の `keyboard.down("Shift") + page.mouse.*` は環境によって MapLibre の `mousedown` に `shiftKey=true` が伝わらない。E2E では必要に応じて DOM event dispatch を使う。
- E2E では MapLibre の pixel 完全一致は検証しない。canvas 非空、UI 状態、store 状態、paint property、download event など安定する観点を検証する。

---

## テスト戦略

完了報告前には原則として以下を実行する。

1. `pnpm typecheck`
2. `pnpm test`
3. `pnpm e2e`
4. `pnpm build`
5. 必要に応じて `pnpm dev` を起動し、実ブラウザで主要操作を確認する。

CI は `.github/workflows/ci.yml` で typecheck と unit test を実行する。E2E はローカル検証を主とする。

---

## Git / 協調開発

- Claude / Codex / 手作業が混ざるため、作業前に `git status --short --branch` を確認する。
- 他者の未コミット変更を勝手に戻さない。
- 大きめの作業は `main` 直ではなく branch / PR 経由を基本にする。
- `docs/reports/` のような調査メモは、必要なときだけ内容を確認し、公開・追跡対象にするかは都度判断する。

---

## 参考

- 国土地理院 地理院タイル一覧: https://maps.gsi.go.jp/development/ichiran.html
- 国土地理院 ベクトルタイル試験公開: https://github.com/gsi-cyberjapan/vector-tile-experiment
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
