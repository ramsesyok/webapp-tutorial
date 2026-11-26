# レベル1のSPA実装例

[Orval版](orval)と[Hey API版](hey-api)を用意しました。両版ともレベル0のReact、MUI、OpenLayers、TanStack Query、Zustand、Zodの構成を使い、検索・詳細・登録・更新・削除・URL共有に座標の下書きと項目別エラー表示を加えています。比較元は[レベル0の実装例](../level0/README.md)です。

## 起動

Node.js 22.18以降とレベル1のバックエンドを使います。リポジトリのルートでバックエンドを起動します。配布済みの実行ファイルを使う場合の手順は[バックエンドの起動](../../README.md#バックエンドの起動)を参照してください。

```sh
go run ./src
```

別のターミナルで使う版のディレクトリを開き、依存関係をインストールします。

```sh
cd examples/level1/orval
npm ci
npm run dev -- --port 5173 --strictPort
```

Hey API版は `examples/level1/hey-api` で同じコマンドを実行します。ブラウザーで `http://127.0.0.1:5173/` を開きます。両版を同時に開く場合は、片方に別のポートを指定してください。Viteは `/api` と `/map` を `http://127.0.0.1:8080` に転送します。バックエンドが別のポートなら、Viteを起動する前に環境変数 `TUTORIAL_BACKEND_URL` に接続先を設定します。

`npm run dev` と `npm run build` は実行前に `npm run generate:api` を呼びます。クライアントとZodスキーマの生成元は[レベル1のOpenAPI定義](../../schema/level1/openapi.yaml)です。バックエンドからSPAを配信する場合は、`npm run build` で生成した `dist` を実行ファイルの隣に置きます。

## レベル0からの変更を読む

| ファイル | 読むポイント |
| --- | --- |
| [`App.tsx`](orval/src/App.tsx) | 地図とフォームが使う座標の下書きを保持。キャンセル時は下書きを破棄し、保存時は既存のAPIフックでデータを更新する。 |
| [`PlaceMap.tsx`](orval/src/PlaceMap.tsx) | OpenLayersの `Translate` を黄色い編集用ピンだけに適用。ドラッグ終了時に経度・緯度をフォーム用に返す。 |
| [`PlaceEditor.tsx`](orval/src/PlaceEditor.tsx) | 下書きを保持し、送信前とサーバー応答の項目別エラーを各入力欄に表示する。 |
| [`places.ts`](orval/src/places.ts) | 座標欄の文字列を数値に変換し、生成したZodスキーマで座標とフォーム全体を検証する。APIエラー本文から `fieldErrors` と `message` を読み取る。 |

## バリデーションを比較する

| 処理 | Orval版 | Hey API版 |
| --- | --- | --- |
| Zodスキーマの生成 | `orval.config.ts` に `client: 'zod'` の出力を追加し、`src/api/generated/validation.ts` に生成する。 | `openapi-ts.config.ts` のプラグインに `zod` を追加し、`src/api/generated/zod.gen.ts` に生成する。 |
| 登録・更新フォームの検証 | `CreatePlaceBody` または `UpdatePlaceBody` を `safeParse` で使う。 | `zCreatePlaceBody` または `zUpdatePlaceBody` を `safeParse` で使う。 |
| 地図に表示する座標の検証 | `PlaceMapFields.pick` で経度と緯度のルールを取り出す。 | `zPlaceMapFields.pick` で同じ項目を取り出す。 |
| APIが `400` を返したとき | 生成されたFetchクライアントが `Error` を投げ、本文は `error.info` に入る。 | 生成されたミューテーションオプションが `throwOnError: true` を指定し、本文がそのまま渡る。 |

`PlaceEditor.tsx` の `submit` から `validatePlaceInput` を呼び、緯度 `100` などを送信前に検出します。名前とメモはOpenAPIに合わせてコードポイント数で長さを判定するため、生成スキーマがUTF-16の長さだけで超過と判定した場合は数え直します。コードを比較するときは、それぞれの `validatePlaceInput` を開いてください。[Orval版](orval/src/places.ts)・[Hey API版](hey-api/src/places.ts)

サーバーからの項目別エラーは、各版の `getApiError` が `fieldErrors` を取り出して画面に渡します。[Orval版のAPIフック](orval/src/api/use-places.ts)・[Hey API版のAPIフック](hey-api/src/api/use-places.ts)

Hey API 0.99.0は、名前のパターンにある `U+2028` と `U+2029` を正規表現内に直接出力します。`npm run generate:api` は生成後に2文字をエスケープし、OpenAPIの名前の制約を保ったままコンパイルできるようにします。[生成後の補正スクリプト](hey-api/scripts/escape-zod-line-separators.mjs)

## 確認手順

1. 一覧からブランデンブルク門を開き、「編集」を選びます。黄色いピンをドラッグして経度・緯度欄が変わることを確認します。
2. 緯度欄に `100` を入力して保存を押します。緯度欄に理由が表示され、ほかの入力と直前のピンの位置が残ることを確認します。
3. 有効な座標を入力してピンが移動することを確認します。「キャンセル」を押すと、ピンが保存済みの座標に戻ります。
4. 編集し直して有効な座標を保存します。詳細とピンが更新され、再読み込みしても新しい位置が表示されることを確認します。
5. Swagger UIから緯度 `100` の登録・更新を送ります。`400` の `fieldErrors.latitude` に理由があり、データが保存されていないことを確認します。
