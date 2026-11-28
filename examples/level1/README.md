# レベル1のSPA実装例

[Orval版](orval)と[Hey API版](hey-api)を用意しました。両版ともレベル0の構成を引き継ぎ、React Hook Formで拠点の下書きと項目別エラーを管理します。比較元は[レベル0の実装例](../level0/README.md)です。

## 起動

Node.js 22.18以降とレベル1のバックエンドを使います。ソースから起動する場合は、レベル1の配布タグをチェックアウトし、そのルートで次のコマンドを実行します。配布済みの実行ファイルを使う場合の手順は[バックエンドの起動](../../docs/README.md#バックエンドの起動)を参照してください。

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
| [`App.tsx`](orval/src/App.tsx) | `useForm` で下書きを管理し、編集を開くたびに `reset` で初期値を設定する。ドラッグ後の座標は `setValue` でフォームに反映する。 |
| [`PlaceMap.tsx`](orval/src/PlaceMap.tsx) | `useWatch` で経度・緯度だけを購読する。OpenLayersの `Translate` は黄色い編集用ピンに適用する。 |
| [`PlaceEditor.tsx`](orval/src/PlaceEditor.tsx) | `Controller` でMUIの入力欄をつなぎ、`handleSubmit` で保存する。APIの項目別エラーは `setError` で反映する。 |
| [`places.ts`](orval/src/places.ts) | `resolvePlaceDraft` が座標の文字列を数値に変換し、生成Zodで検証した結果をReact Hook Formに返す。 |

## バリデーションを比較する

生成Zodの使い方、`400` の項目別エラー、生成後の補正をまとめています。 [Lv1の技術比較](../../docs/orval-hey-api-comparison.md#lv1-フォームと生成zod)

## 確認手順

1. 一覧からブランデンブルク門を開き、「編集」を選びます。黄色いピンをドラッグして経度・緯度欄が変わることを確認します。
2. 緯度欄に `100` を入力して保存を押します。緯度欄に理由が表示され、ほかの入力と直前のピンの位置が残ることを確認します。
3. 有効な座標を入力してピンが移動することを確認します。「キャンセル」を押すと、ピンが保存済みの座標に戻ります。
4. 編集し直して有効な座標を保存します。詳細とピンが更新され、再読み込みしても新しい位置が表示されることを確認します。
5. Swagger UIから緯度 `100` の登録・更新を送ります。`400` の `fieldErrors.latitude` に理由があり、データが保存されていないことを確認します。
