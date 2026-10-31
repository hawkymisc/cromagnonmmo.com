# Cloudflareへのデプロイ

現在の構成はソロプレイ用です。ゲームの進行はブラウザー内で処理し、IndexedDBに保存します。Workerは静的ファイルを配信し、オンライン用の入口は無効にしています。

## 準備

Node.jsとpnpmの対応版は [開発環境](DEVELOPMENT.md) を参照してください。デプロイ先のCloudflareアカウントとWorkerを自分で用意し、`wrangler.jsonc` のWorker名を設定します。現在のデプロイ用スクリプトはWorkers Freeを前提としています。

- `vars.SERVICE_ENABLED` は `"false"` のままにします。
- Static Assetsは `ASSETS` バインディングで配信します。
- 既存の環境を更新する場合、保存を保持するためDurable Objectのバインディング・クラス・migrationを変更しないでください。
- 独自ドメインをダッシュボードで管理する場合、`route`・`routes` を設定ファイルへ追加しないでください。
- フォークでは共有URLとアクセス解析の対象ドメインも変更してください。

## ローカル検証

```sh
pnpm install --frozen-lockfile
pnpm run audit:oss
pnpm run verify:production
```

本番前の検証は、型・strict・構文・依存境界、書式、依存監査、ビルド、全テスト、Workerドライラン、Chromeでのゲーム操作、サイトのメタデータと解析同意を確認します。Google Chromeが必要です。

出力先の `verification.json` と `cloudflare-build.json` には、結果と配信するファイルのSHA-256が記録されます。検証に合格した成果物を使用し、アップロード前に成果物と設定を照合してください。

## アップロード

Wranglerを自分のCloudflareアカウントで認証してください。認証情報はコミットしません。デプロイ用スクリプトは `assets/cloudflare/account-verification.json` にある `accountId`・`workersPlan`・`checkedAt` を読み、Freeの確認が15分以内であることを検査します。このファイルはGitの対象外です。値はデプロイ先で実際に確認したものを設定します。

```sh
pnpm run deploy:cloudflare
```

このコマンドは公開用ビルド、ドライラン、公開対象の検査を経てアップロードします。公開後は配信ファイルのSHAと `/api/health` を確認してください。ソロ設定では `/api/status` と `/ws` は503を返します。オンライン用の接続・保存テストはソロ環境へ実行しないでください。

ブラウザーの保存はオリジンごとに独立しています。独自ドメインとworkers.devは別々の保存先になり、URLの変更だけで保存が移ることはありません。

参考：[Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/)、[Workersの制限](https://developers.cloudflare.com/workers/platform/limits/)、[Wrangler](https://developers.cloudflare.com/workers/wrangler/)。
