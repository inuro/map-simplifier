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
  main.ts            # アプリエントリ（MapLibre 初期化・UI束ね）
  map/
    gsiSource.ts     # GSIベクトルタイルの source 定義
    style.ts         # レイヤスタイル（簡略・モノトーン含む）
  export/
    png.ts           # canvas からの PNG 書き出し（attribution 合成含む）
  ui/
    controls.ts      # ズーム/範囲/出力ボタン等
  state/
    viewState.ts     # 中心座標・ズーム・表示レイヤ等のアプリ状態
tests/
  unit/              # Vitest
  e2e/               # Playwright
```

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
