# セキュリティの問題の知らせ方 / Reporting a security problem

公開サイト [cromagnonmmo.com](https://cromagnonmmo.com/) と、このリポジトリのコードのセキュリティの問題は、公開のIssueに書かずに、GitHubの非公開の報告で知らせてください。リポジトリの **Security** タブの **Report a vulnerability** から送れます。

- 対象：公開サイト（Cloudflare Workers）、ローカルのNodeサーバー（`server.mts`）、ブラウザーのコード。
- 書いてほしいこと：問題の場所、再現の手順、影響。
- 公開サイトに負荷をかける確認（大量の接続・リクエスト）や、他の人の保存データに触れる確認はしないでください。

個人の制作物なので、返事や修正には時間がかかることがあります。

認証情報を誤って公開した場合は、履歴の整理より先に、影響する認証情報を失効・再発行してください。報告には秘密の値を含めず、ファイル・コミット・検出の種類を記載してください。`.gitignore` の追加や通常の削除コミットだけでは、過去のコミットや既存の複製から消えません。履歴や外部の複製の処置は、影響を確認してから別途判断します。

---

Please report security problems in the public site [cromagnonmmo.com](https://cromagnonmmo.com/) or in this repository's code privately, not in a public issue: use **Report a vulnerability** on the repository's **Security** tab.

- In scope: the public site (Cloudflare Workers), the local Node server (`server.mts`) and the browser code.
- Please include where the problem is, how to reproduce it and its impact.
- Do not load-test the public site (floods of connections or requests) or touch other people's saved data.

This is a personal project, so replies and fixes may take some time.

If credentials are exposed, revoke or rotate them before considering history cleanup. Report the file, commit and credential type without including the value. Adding an ignore rule or a deletion commit does not remove old commits or existing copies; history and external-copy cleanup require a separate assessment.
