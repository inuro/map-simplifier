# map-simplifier

書籍原稿用の簡略化地図図版を作成するツール。国土地理院ベクトルタイルをベースに、ブラウザ上でインタラクティブに要素を取捨選択してPNGとして書き出す。

- **リポジトリ**: https://github.com/inuro/map-simplifier
- **バックログ**: [GitHub Issues](https://github.com/inuro/map-simplifier/issues)
- **プロジェクト**: https://github.com/inuro/map-simplifier/projects (必要に応じて)

---

## 要件（Why — 解決したい課題）

書籍の原稿執筆で「位置関係を示す地図図版」を差し込みたいとき、既存の地図サービスをスクリーンショットしただけでは次の問題がある。

1. **情報が多すぎる**：商業POI・過剰な注記・色数が多く、紙面で読みにくい。書籍本文では「この場所がこの位置関係にある」ことが伝われば十分で、それ以外はノイズ。
2. **必要要素だけ残したい**：特定の道路・駅・山・建物など、本文で言及する対象だけを残し、それ以外は淡く/非表示にしたい。
3. **出典が確かでライセンスが扱いやすい**：国土地理院地図タイル（ベクトル含む）は出典明記で利用可能。
4. **繰り返し作り直す**：ズーム・範囲・残す要素の調整を何度も試すので、GUIで対話的に操作できる必要がある。

**最終ゴール**：任意の位置・ズームの国土地理院地図から、要素を取捨選択・簡略化したPNG図版を対話的に書き出す。

---

## 仕様（What/How）

### 技術スタック

- **ランタイム**：ローカルWebアプリ（Node.js dev server, モダンブラウザで動作）
- **ビルド**：Vite + TypeScript
- **地図レンダラ**：MapLibre GL JS（ベクトルタイル描画）
- **タイルソース**：国土地理院「ベクトルタイル試験公開」（`cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf`）
- **単体テスト**：Vitest
- **E2E / UI 検証**：Playwright
- **パッケージマネージャ**：pnpm（corepack 経由、lockfile コミット）

選定理由：ベクトルタイルを要素単位でクリック検知・スタイル差し替えできるのは MapLibre が最も素直。ローカルWeb配信なら Vite の dev server で十分。

### 環境固有の注意

1. **Node**：`.nvmrc` で v22.18.0 に固定。Codex.app 同梱の Node（Hardened Runtime + `disable-library-validation` 未付与）だと rollup の prebuilt `.node` が dlopen 失敗する。nvm 版を使う。
2. **node_modules の置き場所**：このリポジトリは Dropbox (`/Library/CloudStorage/Dropbox/…`) 配下にあるため、`.npmrc` で pnpm の `virtual-store-dir` を `~/.local/share/map-simplifier-virtual-store` に外出ししている。これでネイティブバイナリ本体は Dropbox 同期外に置かれ、プロジェクト内の `node_modules` は symlink のみになる。

この種の環境横断の話は `~/.claude/CLAUDE.md` から参照する Obsidian ノート `topics/mac-dev-environment.md` にも記録している。変更があれば両方を更新する。

### 実レイヤ名（experimental_bvmap）

`scripts/inspect-tile.mjs` で実タイルを解析した結果、国土地理院ベクトルタイル試験公開の source-layer は以下。スタイル(`src/map/style.ts`)もこの名称に合わせている。

| source-layer | ジオメトリ   | 意味           |
| ------------ | ------------ | -------------- |
| waterarea    | Polygon      | 水域           |
| wstructurea  | Polygon      | 水部構造物     |
| river        | LineString   | 河川           |
| road         | LineString   | 道路           |
| railway      | LineString   | 鉄道           |
| building     | Polygon      | 建物           |
| boundary     | LineString   | 行政界         |
| other        | LineString   | その他         |
| transp       | Point        | 交通記号       |
| symbol       | Point        | 記号           |
| label        | Point        | 注記           |

### アーキテクチャ概略

```
src/
  main.ts                    # アプリエントリ（MapLibre 初期化・UI束ね・イベント配線）
  map/
    gsiSource.ts             # GSIベクトルタイルの source 定義・出典クレジット（gsi-ids:// 使用）
    idProtocol.ts            # gsi-ids:// addProtocol：pbf をパース→feature.id 連番注入→vt-pbf で再エンコード
    style.ts                 # preset 別スタイル (standard / mono)、BASE_*_WIDTH 定数、HIDEABLE_LAYER_IDS、hidden=true 時 opacity 0 の expression
    hiddenSync.ts            # editState.hidden と feature-state の同期（load/styledata/sourcedata/idle で syncAll）
    selectionOverlay.ts      # 選択中 feature の橙縁取り overlay
    highlightOverlay.ts      # 強調中 feature の赤塗り＋縁取り overlay
    rubberBand.ts            # Shift+drag 矩形選択の DOM 追従と bbox 算出
    lineWidth.ts             # line-width factor を paint property に反映
  state/
    viewState.ts             # 中心・ズームの hash encode/decode
    editState.ts             # hidden[] と highlighted[] の store + snapshot/restore
    selectionStore.ts        # 選択中 feature の store（click=select/toggle/multi）
    history.ts               # snapshot-based Undo/Redo（汎用）
    lineWidthStore.ts        # line-width factor（road/railway/river/boundary）と +/- 操作
  export/
    png.ts                   # canvas からの PNG 書き出し（下部クレジット帯合成）
scripts/
  inspect-tile.mjs           # 実 GSI タイルの pbf 解析（source-layer 名・feature.id 有無 等）
tests/
  unit/                      # Vitest（純関数ロジック・store 群）
  e2e/                       # Playwright（実ブラウザで UI 行動と paint property 変化を検証）
.github/workflows/ci.yml     # ubuntu + pnpm + typecheck + vitest（E2E は flaky 回避で含めない）
```

### 主要な設計判断

- **選択ベースの編集モデル**：`click = 選択` / `削除 / 強調 / ラベル` などは選択状態に対するアクション。`#15` で導入。
- **削除は feature-state による真の非表示**（#26 で確定。以前は bg 色 mask overlay だったが、ズームアウト時の過剰被覆・橋の下の水域が背景色になる等の不自然さで撤去）。実装：
  1. `gsi-ids://` 独自プロトコルを `maplibregl.addProtocol` で登録。GSI 実タイルを fetch → `@mapbox/vector-tile` でパース → 各 layer の各 feature に **タイル内連番 id（1-origin）** を注入 → `vt-pbf` で再エンコードして返す。
  2. 各 hideable レイヤの paint に `["case", ["boolean", ["feature-state", "hidden"], false], 0, 1]` を `line-opacity` / `fill-opacity` として付与。feature-state=hidden が true になった feature だけ不可視化。
  3. `HiddenSync`（src/map/hiddenSync.ts）が `editState.hidden` の `{sourceLayer, geometry}` と現在 rendered な feature を geometry で突き合わせ、マッチした feature の `setFeatureState({source: "gsi", sourceLayer, id}, {hidden: true})` を叩く。同期タイミングは `load / styledata / sourcedata(isSourceLoaded) / idle / editState 変更`。
  4. `filter` は feature-state 式を受け付けないので、**隠しきれない部分は click/hover 側で `editState.isHidden` によって無視する**（queryRenderedFeatures は opacity 0 でも feature を返すため）。
  5. feature.id はタイル内ローカルの連番で、**タイル跨ぎの同一 feature にはグローバル id が無い**（GSI の元データが持たない）。跨ぎ同一性は geometry 比較で扱う。副作用として、ズームを跨いだ同一論理 feature は別 geometry として扱われ、別ズームではマッチしないことがある（同ズームに戻れば再マッチ）。
- **Undo/Redo**：`History<T>` 汎用 snapshot ベース。`editState` の `snapshot()/restore()` でディープコピー。選択・ビュー設定（preset/line-width）は履歴に乗せない（編集のみ）。
- **overlay 層の順序**：base（feature-state で hidden 適用済み） → `highlight-overlay` → `selection-overlay`（縁取り）の順。hidden は base 側の opacity で処理するため hidden overlay は持たない。
- **line-width 調整**：factor を別 store で保持。style.ts が `BASE_*_WIDTH` を export し、runtime で `setPaintProperty` 経由で掛け算。preset 切替や styledata 時に再適用。
- **`queryRenderedFeatures` の引数形式に注意**：`{x, y}` オブジェクトを渡すと options と誤解釈され viewport 全体走査になる（本プロジェクトで実害あり）。必ず `[x, y]` 配列形式で渡す。
- **MapLibre の shift+drag（boxZoom）を disable**：デフォルトの矩形ズームが本アプリの矩形選択（#17）と衝突するため `map.boxZoom.disable()` を明示。

### 現時点の既知の制約

- 削除された feature の同一性は geometry deep-equal で判定する。ズームを跨ぐと同じ論理 feature でも geometry が変わるため、別ズームではマッチしない（同ズームに戻ると再マッチし、非表示が復元される）。書籍図版は基本的に単一ズームで確定させるため実害は小さいが、完全な永続一意性は持たない。
- Playwright の `keyboard.down('Shift') + page.mouse.*` は本環境で MapLibre の mousedown に `shiftKey=true` を伝えなかった。E2E はシフト系は `dispatchEvent` で記述している。

### 出力仕様

- **形式**：PNG
- **解像度**：画面表示サイズ等倍（MapLibre canvas をそのまま PNG 化）
- **クレジット**：「出典：国土地理院ベクトルタイル」相当の文言を画像内または別メタとして同梱（書籍掲載時の出典明記義務に対応）

---

## 進捗・バックログ管理

**進捗・バックログの管理は GitHub Issues で行う**。CLAUDE.md は要件・仕様・アーキテクチャを示す一次ドキュメントで、todo のチェックリストは持たない。

- 新規作業項目は Issue を立てる。milestone（M1/M2/M3...）で段階を表現し、label で種別（feat / fix / chore / docs / test）を表現する。
- Issue の粒度：「1 PR で閉じられる」「要件が明快で検証可能」を目安にする。曖昧な大きいものはさらに小さくする。
- 完了した Issue は CLAUDE.md で履歴として残さず、GitHub 上の closed 状態に委ねる。**CLAUDE.md に書くのは、要件が変わる・仕様が変わる・アーキテクチャが変わるときだけ**。

### 完了した節目

- **M1 (2026-04-22)**: 国土地理院ベクトルタイル表示 + PNG 出力。commit `4c93e9c`。
- **M2 進行中 (2026-04-23)**: モノトーンプリセット (#12)、ライン幅 runtime 調整 (#25)。線画プリセット (#11)、カテゴリ別 on/off (#1)、URL 再整理 (#3) が未着手。
- **M3 進行中 (2026-04-23)**: 選択モデル (#20) → 削除+Undo (#21) → 強調 (#22) → 矩形選択 (#23) → 真の削除 feature-state 方式への移行 (#26) まで投入。スティッキーモード (#18)、ラベル (#9)、JSON 保存 (#5) が未着手。

---

## テスト戦略

- **単体テスト（Vitest）**：純関数ロジックを対象。タイルURL構築、ビューステート（中心・ズーム）のエンコード/デコード、PNG書き出しのファイル名生成など。ブラウザAPIに依存する部分は jsdom か vitest-browser-mode、または E2E に寄せる。
- **E2E（Playwright）**：実ブラウザで dev server を起動し、「地図が描画される」「PNG ダウンロードが発火する」を確認。MapLibre のレンダリング結果そのもの（pixel 完全一致）はテストしない — 安定しないため。「canvas が非空」「ダウンロードイベントが発生」「attribution が含まれる」程度を検証。
- **型チェック**：`tsc --noEmit` を CI / 完了前チェックに含める。

### 完了報告前の必須検証

このリポジトリで「実装完了」と報告する前には、以下を自分で実行して通っていることを確認する：

1. `pnpm typecheck`（`tsc --noEmit`）
2. `pnpm test`（Vitest）
3. `pnpm e2e`（Playwright — 実装されている範囲で）
4. `pnpm dev` を起動し、実ブラウザ（Playwright MCP 等でも可）で主要機能が動作することを確認

---

## 参考

- 国土地理院 地理院タイル一覧：https://maps.gsi.go.jp/development/ichiran.html
- 国土地理院 ベクトルタイル試験公開：https://github.com/gsi-cyberjapan/vector-tile-experiment
- 地理院タイル利用規約：出典（「国土地理院」または「地理院タイル」）明記で商用含め利用可、書籍掲載時は出典記載が必要。
