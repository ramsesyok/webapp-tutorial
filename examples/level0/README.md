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

## 比較する箇所

| 処理 | Orval | Hey API |
| --- | --- | --- |
| 一覧と詳細 | 生成された `useListPlaces` と `useGetPlace` を呼び、`select` でHTTPレスポンスの本文を取得 | 生成された `listPlacesOptions` と `getPlaceOptions` を `useQuery` に渡す。生成オプションが本文を返す |
| 登録・編集・削除 | 生成されたミューテーション用フックを呼ぶ。リクエスト本文は `data` に渡す | 生成されたミューテーションオプションを `useMutation` に渡す。リクエスト本文は `body`、パスパラメーターは `path` に渡す |
| キャッシュ更新 | `getListPlacesQueryKey()` で検索条件ごとの一覧を無効化 | `listPlacesQueryKey()` で検索条件ごとの一覧を無効化 |
| HTTPエラー | `forceSuccessResponse` により非2xxをrejectし、本文はエラーの `info` に入る | 生成されたQueryオプションが `throwOnError` を設定し、非2xxの本文をthrowする |

まず生成設定と `src/api/use-places.ts` を見比べると、ツールごとの使い方を追えます。画面、地図、フォーム、状態管理は各サンプルに同じコードを置いています。拠点IDと適用済み検索条件はURL、地図の位置指定モードはZustand、サーバーのデータはTanStack Queryで扱います。Zodのフォーム検証も両方で共通のルールを使います。

- Orval版の [生成設定](orval/orval.config.ts) と [APIフック](orval/src/api/use-places.ts)
- Hey API版の [生成設定](hey-api/openapi-ts.config.ts) と [APIフック](hey-api/src/api/use-places.ts)

## 比較の手順

1. 「ベルリン」で検索し、ピンと一覧から同じ場所の詳細を開きます。開いたURLを別タブに貼り付け、選択と検索条件が復元されることを確認します。
2. 検索条件をクリアし、「場所を追加」から地図をクリックします。検索・一覧・詳細の欄が登録フォームに切り替わるので、地図を見ながら入力して保存します。「編集」でも同じ欄がフォームに切り替わります。名前を変更して保存し、一覧と詳細への反映を確認します。キャンセルした場合は一覧と詳細に戻ります。
3. 編集フォームに範囲外の緯度を入力し、Zodの検証メッセージを確認します。別タブで対象を削除してから元のタブで保存すると、APIの `404` とサーバーのエラーメッセージを確認できます。
4. 検索に一致しないキーワードを指定し、空一覧が表示されることを確認します。作成した場所は削除し、再読み込み後も消えていることを確認します。
