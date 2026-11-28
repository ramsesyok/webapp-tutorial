# レベル2のSPA実装例

[Orval版](orval)と[Hey API版](hey-api)は、[レベル1のSPA](../level1/README.md)に同じログイン画面とログアウト操作を加えています。ブラウザーがCookieを送信し、SPAはAPIからログイン状態を取得します。

## 起動

Node.js 22.18以降とレベル2のバックエンドを使います。ソースから起動する場合は、レベル2の配布タグのルートで次のコマンドを実行します。

```sh
go run ./src
```

初期ログインIDは `student` です。パスワードは初回の起動ログに表示される値か、講師が `TUTORIAL_INITIAL_PASSWORD` で指定した値を使います。配布済みの実行ファイルを使う場合は、[レベル2の準備手順](../../docs/level2.md#準備)を参照してください。

別のターミナルで実装例のディレクトリを開きます。

```sh
cd examples/level2/orval
npm ci
npm run dev -- --port 5173 --strictPort
```

Hey API版では `examples/level2/hey-api` で同じコマンドを実行します。ブラウザーで `http://127.0.0.1:5173/` を開きます。もう一方の版を確認するときは、先に起動したViteを停止します。

Viteは `/api` と `/map` を `http://127.0.0.1:8080` に転送します。Viteのポートを変えるときは、バックエンドの `-spa-origin` に対応するオリジンを指定します。バックエンドのポートを変えるときは、Viteの起動前に `TUTORIAL_BACKEND_URL` で転送先を指定します。

## コード生成と比較

`npm run generate:api` は[レベル2のOpenAPI定義](../../schema/level2/openapi.yaml)からクライアントとZodスキーマを生成します。`npm run dev` と `npm run build` も実行前に生成します。

| 比較する処理 | Orval版 | Hey API版 |
| --- | --- | --- |
| ログイン状態の取得 | 生成フック `useGetSession` を使い、`select` で `response.data` を取り出す | `getSessionOptions` を `useQuery` に渡すと、結果はユーザーの本文になる |
| ログイン・ログアウト | `useCreateSession` と `useDeleteSession` を使う。ログイン入力は `data` で渡す | `createSessionMutation` と `deleteSessionMutation` を `useMutation` に渡す。ログイン入力は `body` で渡す |
| `401` の扱い | `Error.info` の本文からエラーコードを読む | 生成オプションが返すエラー本文からエラーコードを読む |

セッションAPIは [Orvalの呼び出し](orval/src/api/use-session.ts) と [Hey APIの呼び出し](hey-api/src/api/use-session.ts) を比較できます。ログイン画面と認証状態による表示の切り替えは、両版の `LoginForm.tsx` と `App.tsx` が同じです。セッションが無効になったときは `api/query-client.ts` で拠点のキャッシュを消去します。

## ブラウザーでの確認

1. 未ログインの状態で `http://127.0.0.1:5173/?place=1&q=ベルリン` を開きます。ログイン画面が出て、拠点APIの呼び出しはログイン後に始まります。
2. 配布されたアカウントでログインし、ブランデンブルク門の詳細と検索条件が表示されることを確認します。開発者ツールのネットワーク欄では、ログイン応答の `Set-Cookie` と、後続の拠点APIリクエストの `Cookie` を確認できます。
3. 再読み込みし、ログイン状態と拠点の選択が復元されることを確認します。
4. ログアウトし、ピンと詳細が消えることを確認します。同じURLを再読み込みすると、再びログイン画面が表示されます。
