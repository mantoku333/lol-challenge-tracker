# 世界旅行・調和 対応版

2026-10-20 / バージョン `1.2.0-team.1`

Nyquase/lol-challenge-tracker の `a29c6e32e70257e3aac8264f05582d866afc1a27`（v1.1.4）を基に、世界旅行13項目と調和12項目を追加したローカル開発版です。ブランチは `feat/team-challenges`。GitHubへのフォーク作成・プッシュ・公開は行っていません。

## 起動

インストーラー：

`release/1.2.0-team.1/LoL Challenge Tracker-Windows-1.2.0-team.1-Setup.exe`

インストールせずに試す場合：

`release/1.2.0-team.1/win-unpacked/LoL Challenge Tracker.exe`

後者は `win-unpacked` フォルダー全体が必要です。EXE単体を移動しないでください。今回はアプリのインストールや普段の設定変更は行っていません。

1. LoLクライアントを起動し、普段のアカウントでログインします。
2. このアプリを起動します。アプリを先に起動しても、クライアントを定期的に探します。
3. 上部の「チャンプ別」「世界旅行」「調和」を選びます。
4. 世界旅行・調和では左の項目を選ぶと、進捗、対象チャンピオン、味方の構成が表示されます。
5. 「一つの信念」は判定するクラスを選択します。レーンではなく、アサシン・ファイター・メイジ・マークスマン・サポート・タンクの分類です。
6. 進捗の反映が遅い場合は「更新」を押します。試合終了時にも直後・3秒後・10秒後の最大3回、再取得します。

クライアント外のElectronウィンドウなので、チャンピオン選択画面と並べて使えます。接続前も25項目の名称・説明を閲覧できますが、個人の進捗・対象リストは「未取得」と表示されます。

## 追加した機能

- 世界旅行13項目・調和12項目の日本語名、説明、勝利数、現在ランク、次ランクまでの必要数。
- 親2項目の進捗はポイントとして別表示。
- LCUの `availableIds` に基づく対象一覧。日本語・英語のチャンプ検索。
- 調和の同一クラス項目は `roles` の全配列を参照し、第2クラスも対象にします。
- 味方5人の現在ピックと自分のピックの適合表示。
- 3体条件でも5人の選択が揃うまで「構成条件を満たす」と表示しません。
- 未取得、0勝、取得した最高段階到達を区別。未知・重複・不正なIDやクラス情報欠損による誤判定を防ぎます。
- セレクト途中の起動時に現在セッションを取得。選択解除、交換、セッション削除、退出、切断時のリセット。
- WebSocket切断時の再接続。接続情報を出力していた既存ログを削除。
- 既存のS+等のチャンプ別表示を維持し、項目切替時にも自分のピックのDone状態を再計算。

構成の一致はプレビューです。5人プリメイドであることや対象モードを確認しているわけではありません。実際の達成は、対象モードで勝利した後にLCUが返す進捗で確認してください。

## 検証済み

実行環境：Windows x64、Node.js 24.12.0、npm 11.6.2、Electron 29.4.6、Vite 5.4.21。

- `npm test`：15テスト成功。25項目、親子の分離、0と欠損、動的閾値、マスター以降、3/5体条件、不完全な構成、未知・重複・不正ID、第2クラス、クラス情報欠損、ピックの交換・解除・削除を確認。
- `npm run check`：Vue/rendererとElectron/main両方の型チェック成功。
- `npm run build`：Windows x64 NSISインストーラー作成成功。
- `npm run test:ui`：開発用Electronとパッケージ化したEXEの両方で成功。日本語タブ、13/12項目、進捗、親のポイント、構成の途中状態と条件充足、項目切替による再判定、クラス選択、検索、既存S+表示、未取得・切断時のリセットを確認。
- テスト用画面を画像で確認。UIテストは独立した設定フォルダーと架空のLCU応答を使用しています。

UIテストのチャンプ分類・対象ID・勝利数は検証用の架空データであり、実際のゲームの対応表ではありません。

## 今回未確認のこと

ユーザー指定により、今回は実装とビルドまでです。LoLクライアントへの実接続、実際の `thresholds` / `availableIds` の応答形式、実戦のピック通知、5人プリメイドでの勝利後の加算、「一つの信念」のゲーム側判定との一致は未確認です。インストーラーのインストール操作は行っていません。

実機ではまずクライアントとアプリの勝利数・ランク・対象一覧を照合し、チャンプ選択中の起動、交換、選択解除、退出、再接続、試合後の更新を確認してください。未対応の応答形式は0や達成扱いにせず未取得として表示します。

本版はRiot承認済みであることやアカウント処分がないことを保証するものではありません。上流のElectron/TLS設定は維持しており、全面的なセキュリティ更新や公開配布向けの審査は今回の範囲に含めていません。

## 開発を続ける

このREADMEがあるディレクトリで実行します。テストにはNode.js 24以降を使用してください。

```powershell
npm ci
npm test
npm run check
npm run dev
```

ビルドとUIテスト：

```powershell
npm run build
npm run test:ui

# パッケージ化したEXEを同じUIテストで確認する場合
$env:TRACKER_TEST_EXE = (Resolve-Path 'release\1.2.0-team.1\win-unpacked\LoL Challenge Tracker.exe').Path
npm run test:ui
Remove-Item Env:TRACKER_TEST_EXE
```

`package-lock.json` を保存しているので `npm ci` で依存を再現できます。既存依存のメジャー更新は行っていません。UIテスト用に `@playwright/test` を開発依存へ追加しました。Electronを使うため別途ブラウザのダウンロードは不要です。既存アプリを閉じてからテストしてください。

`LOL_TRACKER_USER_DATA` に既存の絶対パスを指定すると設定を別フォルダーに保存できます。自動テストはこの仕組みで普段の設定と分離します。

主な追加ファイル：

- `src/helpers/team-challenges.ts`：進捗と対象・構成の判定。
- `src/components/TeamChallenges.vue`：日本語の構成チャレンジ画面。
- `src/types/team.ts`：構成チャレンジの型。
- `electron/main/team-session.ts`：現在の味方ピックの抽出。
- `tests/team-challenges.test.ts`：判定・セッション解析テスト。
- `tests/ui/electron.spec.ts`：Electronの画面テスト。

## 表示データの出典

[元リポジトリ](https://github.com/Nyquase/lol-challenge-tracker)を基に実装しています。

日本語の補助表示は2026-10-20に取得した[CommunityDragon日本語チャレンジ定義](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/ja_jp/v1/challenges.json)と[チャンピオン名](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/ja_jp/v1/champion-summary.json)を `src/data/team-ja.json` に同梱しています。LCUの名称・説明が日本語ならそれを優先します。チャンプ名の新規IDは取得したクライアント名にフォールバックします。

この静的ファイルは名称・説明の補助だけに使用します。個人の進捗・対象ID・ランク閾値を静的データから補完しません。
