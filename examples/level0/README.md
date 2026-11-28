# レベル0のSPA実装例

[Orval版](orval) と [Hey API版](hey-api) は、同じレベル0バックエンドと [OpenAPI定義](../../schema/openapi.yaml) を使います。どちらもReact、MUI、OpenLayers、TanStack Query、Zustand、Zodで実装しています。画面から地図上の場所を登録し、検索、詳細取得、編集、削除、URL共有を試せます。

## 起動

Node.js 22.18以降（動作確認はNode.js 24）を使用します。先に配布済みのレベル0バックエンドを `127.0.0.1:8080` で起動します。起動方法はリポジトリのREADMEを参照してください。 [バックエンドの起動](../../README.md#バックエンドの起動)

リポジトリのルートから、別々のターミナルで実行します。

**Orval版**

```sh
cd examples/level0/orval
npm ci
npm run dev -- --port 5173 --strictPort
```

**Hey API版**

```sh
cd examples/level0/hey-api
npm ci
npm run dev -- --port 5174 --strictPort
```

ブラウザーでそれぞれ `http://127.0.0.1:5173/`、`http://127.0.0.1:5174/` を開きます。Viteが `/api` と `/map` をバックエンドに転送します。両画面は同じSQLiteのデータを使うので、一方で登録した場所は他方を再読み込みすると表示されます。バックエンドのポートを変えた場合は、Viteを起動する前に環境変数 `TUTORIAL_BACKEND_URL` に接続先を設定します。

`npm run dev` と `npm run build` は、実行前にコードを生成します。生成コードだけを見たい場合は `npm run generate:api` を実行し、各サンプルの `src/api/generated/` を開きます。配布バイナリからSPAを配信する場合は、どちらかのサンプルで `npm run build` を実行し、生成された `dist` をバックエンド実行ファイルの隣に置きます。

## CodeTourでOrval版を読む

VS Codeで **リポジトリのルート** を開き、[CodeTour拡張機能](https://marketplace.visualstudio.com/items?itemName=vsls-contrib.codetour) をインストールします。エクスプローラーの **CodeTour** で「レベル0 Orval 01」を選ぶと、コードの該当箇所に解説が表示されます。各ツアーの最後から次へ進めます。各テーマは一覧から直接開けます。

レベル0で初めてReactとTypeScriptを使う方向けの順番です。ツアー01で起動とファイルの位置を確認し、02でReactの画面構成を読みます。APIのコード生成と開発時の通信経路は08で扱います。

1. [ローカルで起動して画面とファイルを確認する](../../.tours/level0/orval/01-local-start.tour)
2. [Reactアプリの入口と画面構成](../../.tours/level0/orval/02-react-entry.tour)
3. [Reactの状態とイベントを読む](../../.tours/level0/orval/03-react-state.tour)
4. [TypeScriptの型からデータの形を読む](../../.tours/level0/orval/04-typescript.tour)
5. [Reactの画面に地図を載せる](../../.tours/level0/orval/05-map-render.tour)
6. [地図のクリックを一覧・詳細・登録フォームにつなぐ](../../.tours/level0/orval/06-map-interaction.tour)
7. [検索条件と選択をURLから復元する](../../.tours/level0/orval/07-url-state.tour)
8. [OpenAPIから一覧取得までを追う](../../.tours/level0/orval/08-orval-query.tour)
9. [保存後に一覧と地図が更新される理由](../../.tours/level0/orval/09-save-refresh.tour)
10. [確認ダイアログから削除する](../../.tours/level0/orval/10-delete.tour)
11. [取得中・0件・通信エラーを見分ける](../../.tours/level0/orval/11-request-states.tour)

## 比較する箇所

生成フックと生成オプション、キャッシュキー、HTTPエラーの違いをまとめています。 [Lv0の技術比較](../../docs/orval-hey-api-comparison.md#lv0-api呼び出しとキャッシュ)

## 比較の手順

1. 「ベルリン」で検索し、ピンと一覧から同じ場所の詳細を開きます。開いたURLを別タブに貼り付け、選択と検索条件が復元されることを確認します。
2. 検索条件をクリアし、「場所を追加」から地図をクリックします。検索・一覧・詳細の欄が登録フォームに切り替わるので、地図を見ながら入力して保存します。「編集」でも同じ欄がフォームに切り替わります。名前を変更して保存し、一覧と詳細への反映を確認します。キャンセルした場合は一覧と詳細に戻ります。
3. 編集フォームに範囲外の緯度を入力し、Zodの検証メッセージを確認します。別タブで対象を削除してから元のタブで保存すると、APIの `404` とサーバーのエラーメッセージを確認できます。
4. 検索に一致しないキーワードを指定し、空一覧が表示されることを確認します。作成した場所は削除し、再読み込み後も消えていることを確認します。
