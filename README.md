# 世界の行きたい場所マップ

世界地図に行きたい場所を登録・検索するSPAから始め、訪問拠点の編集、ログイン、担当者の管理、担当エリアの描画へ進む教材です。JavaやC++などの経験があり、ReactとTypeScriptを初めて学ぶ方を対象としています。レベル1以降は前のレベルで作ったSPAを改修します。

## 学習資料

| レベル | 課題 | OpenAPI・実装例 |
| --- | --- | --- |
| [0](docs/level0.md) | 場所の登録・検索、地図と一覧の連動、URL共有 | [OpenAPI](schema/openapi.yaml)・[実装例](examples/level0/README.md) |
| [1](docs/level1.md) | ピンとフォームの連動、入力検証 | [OpenAPI](schema/level1/openapi.yaml)・[実装例](examples/level1/README.md) |
| [2](docs/level2.md) | ログイン、Cookieセッション、ログアウト | [OpenAPI](schema/level2/openapi.yaml)・[実装例](examples/level2/README.md) |
| [3](docs/level3.md) | ユーザー管理、担当拠点の認可、変更履歴 | [OpenAPI](schema/level3/openapi.yaml)・[実装例](examples/level3/README.md) |
| [4](docs/level4.md) | 担当エリアの描画・検証、編集競合 | [OpenAPI](schema/level4/openapi.yaml)・[実装例](examples/level4/README.md) |

各レベルでは、講師が配布する対応版のGoバックエンドとOpenAPI定義を使います。実装例はOrval版とHey API版で同じ操作を試せます。レベル5以降の課題と講師向けのバックエンド改修計画は、[学習計画](tutorial-plan.md)にまとめています。

生成コード、API呼び出し、キャッシュ、入力検証をレベルごとに比較できます。 [OrvalとHey APIの技術比較](docs/orval-hey-api-comparison.md)

## バックエンドの起動

1. 講師から配布された実行ファイルを保存したフォルダでターミナルを開きます。Windows（PowerShell）では `.\webapp-tutorial.exe`、macOS・Linuxでは `./webapp-tutorial` を実行します。
2. [Swagger UI](http://127.0.0.1:8080/swagger/) を開き、タイトルとAPI操作が演習するレベルに対応していることを確認します。配布ZIPでは、対応する定義は `schema/openapi.yaml` に入っています。
3. 演習中はバックエンドを起動したままにします。初回起動時に作業フォルダに `places.sqlite` が作られ、登録・編集したデータは再起動後も残ります。

開発時はViteから `/api` と `/map` をバックエンドに転送します。ビルド済みSPAをバックエンドから配信する場合は、実行ファイルの隣の `dist` に `index.html` と関連ファイルを置き、[SPA](http://127.0.0.1:8080/)を開きます。地図も同じバックエンドから配信するので、演習時は外部の地図サービスへの接続を必要としません。
