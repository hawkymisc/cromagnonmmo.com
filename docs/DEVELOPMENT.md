# 開発環境 / Development

ゲームの起動にアカウント、APIキー、非公開リポジトリ、制作素材の原本は必要ありません。
Node.jsの対応範囲は `package.json` の `engines`、推奨版は `.nvmrc`、pnpmの版は `packageManager` が基準です。

```sh
pnpm install --frozen-lockfile
pnpm start
```

`http://localhost:3000` を開きます。開発中は `pnpm run dev` で変更を監視できます。
Node.js 26ではCorepackを別途インストールしてください。詳しい導入手順は [README](../README.md) にあります。

## 環境変数

`.env.example` は設定項目の見本です。現在の起動スクリプトは `.env` を自動では読みません。
必要な値をシェルで指定してください。以下は任意で、指定しなくても起動できます。

| 変数                | 既定                | 用途                                                                      |
| ------------------- | ------------------- | ------------------------------------------------------------------------- |
| `HOST`              | `127.0.0.1`         | 待受先。同一LANの実機から確かめるときだけ `0.0.0.0` を指定                |
| `PORT`              | `3000`              | 開発サーバーのポート                                                      |
| `CRO_SAVE_DIR`      | `.cro-magnon-save/` | Node側の既存オンライン機能の保存先。現在のソロ保存はブラウザーのIndexedDB |
| `CRO_DELIVERY`      | 配信用変換を使用    | `masters` を指定すると配信用変換を省略。通常は変更不要                    |
| `PLAYWRIGHT_MODULE` | `playwright`        | 一部のQAスクリプトで使う任意のモジュール指定。通常は変更不要              |

POSIXシェル：`PORT=3100 pnpm run dev`。PowerShell：`$env:PORT='3100'; pnpm run dev`。
`HOST=0.0.0.0` のサーバーは認証付きの公開サービスではありません。信頼できるLAN内の検証に限って使ってください。
既定のループバック待受では `localhost`・`127.0.0.1`・`[::1]` 以外のHostヘッダーを拒否します。

Cloudflareのデプロイは別作業です。手元の起動やCIにCloudflareの認証は不要です。
フォークでは、自分のWorker名・ドメインと計測設定を選び、[公開手順](CLOUDFLARE_DEPLOYMENT.md) と [NOTICE](../NOTICE) を確認してください。
本家のGA4識別子は公開設定であり、解析は本家ドメインで明示的に同意した場合だけ有効です。

## 検証

```sh
pnpm run audit:oss
pnpm run check
pnpm run format:check
pnpm test
pnpm run build:cloudflare -- --output-root=output/review-build
```

最後のコマンドはローカルにビルドを作ります。デプロイは行いません。
`audit:oss` は追跡済みファイルとGitが無視していない新規ファイルを調べ、秘密らしい値や個人設定の混入を場所だけで報告します。
ローカルパスの検査はテストでも行います。これらは既知のパターンを使う補助検査で、すべての秘密や個人情報を検出できる保証ではありません。

必要に応じて公式のGitleaksもローカルで使用できます（8.30.1で確認）：

```sh
gitleaks git --log-opts=HEAD --redact --ignore-gitleaks-allow
pnpm audit
```

`.gitleaks.toml` は標準ルールを継承し、秘密と誤認される公開のモデル名とシェーダー名2つだけを完全一致で許可しています。
依存監査はnpmレジストリへの通信が必要です。失敗した照会を「脆弱性0件」と扱わないでください。

## 制作と画面の検証にだけ必要な道具

通常の起動・型検査・単体テストにはPythonやBlenderは不要です。
制作素材を必要とするテストは、その素材を含まないクローンではスキップします。
モデル制作のスクリプトは、各スクリプトが要求する参照画像や元のモデルを別途用意してください。

- 画像の最適化：PythonとPillow。`OPTIMIZATION_PYTHON`、`PERFORMANCE_PYTHON` または `--python` で実行ファイルを選べます。既定はPATHの `python`（Windows）か `python3`（その他）。
- モデルの補修：Blender。`BLENDER` で実行ファイルを指定できます。各スクリプトで要求する版・入力を確認してください。
- TRELLISによる再構成：`MODEL_STUDIO_DIR` にTRELLIS studioのディレクトリを指定します。モデルの原本を別の保管先へ同期する場合は `MODEL_SOURCE_DIR` にコピー先のモデル用ディレクトリを指定します。どちらも通常の起動には不要です。
- 音の再制作：PythonのNumPy、FFmpegなど。各スクリプトの冒頭に必要なものを記載しています。
- 画面のQA：Google Chrome。既存のQAはPlaywrightの `channel: 'chrome'` を使います。Chromeのない環境で通常の単体テストは実行できます。

## 公開するファイルと権利

`.env*`・認証情報・IDE設定・保存データ・制作の原本・一時出力はコミットしません。
`.gitignore` は既に追跡されたファイルや過去の履歴には効きません。公開前に `git status` と差分を確認してください。
認証情報を公開してしまった場合は [SECURITY](../SECURITY.md) に従ってまず失効・再発行し、値を公開Issueに書かないでください。

プログラムはApache-2.0です。第三者のキャラクターやロゴなどの例外は [NOTICE](../NOTICE)、外部素材は [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md) を確認してください。

---

Local play needs no credentials, private services, Python or Blender. Use the Node.js and pnpm versions specified in `package.json` and `.nvmrc`, install with the frozen lockfile, then run `pnpm start`.
`.env.example` documents optional shell variables; scripts do not load `.env` automatically. `HOST` defaults to loopback and `PORT` to 3000.
Use `pnpm run audit:oss`, the checks and tests above before submitting changes. Optional asset-production tools and Chrome QA are separate from the normal setup.
The code is Apache-2.0; consult `NOTICE` for excluded artwork and names, and `THIRD_PARTY_NOTICES.md` for external materials before redistribution.
