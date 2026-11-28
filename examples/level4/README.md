# レベル4のSPA実装例

[Orval版](orval)と[Hey API版](hey-api)は、[レベル3のSPA](../level3/README.md)に担当エリアの一覧、地図、登録・編集を加えます。管理者は登録・割り当てと全件の編集ができ、担当者は自分のエリアの名前と形状を編集できます。

## 起動

Node.js 22.18以降とレベル4のバックエンドを使います。リポジトリのルートでバックエンドを起動します。

```sh
go run ./src -db places-level4.sqlite
```

配布された実行ファイルを使う場合は、`go run ./src` を実行ファイル名に置き換えます。レベル3のデータを引き継ぐときは、既存DBの複製を `-db` に指定します。新規DBの管理者のログインIDは `student` です。パスワードは初回の起動ログに表示される値か、講師が `TUTORIAL_INITIAL_PASSWORD` で指定した値を使います。

別のターミナルで、どちらかのSPAを起動します。

```sh
cd examples/level4/orval
npm ci
npm run dev -- --port 5173 --strictPort
```

Hey API版では `examples/level4/hey-api` で同じコマンドを実行します。[SPA](http://127.0.0.1:5173/)を開き、ログイン後に「担当エリア」に切り替えます。Viteは `/api` と `/map` を `http://127.0.0.1:8080` に転送します。Viteのポートを変更するときは、Goの `-spa-origin` に対応するオリジンを指定します。Goのポートを変更するときは、Viteの起動前に `TUTORIAL_BACKEND_URL` で転送先を指定します。

## コード生成と比較

`npm run generate:api` は[レベル4のOpenAPI定義](../../schema/level4/openapi.yaml)からクライアントとZodスキーマを生成します。 `npm run dev` と `npm run build` も実行前に生成します。

### 生成設定と出力先

- **Orval**は生成したReact QueryフックとFetch関数を `src/api/generated/places.ts` に、Zodスキーマを同じディレクトリの `validation.ts` に出力します。`output.headers: true` を設定し、OpenAPIのリクエストヘッダーを生成フックの引数の型に含めます。[Orvalの生成設定](orval/orval.config.ts)
- **Hey API**は生成したFetch関数を `src/api/generated/sdk.gen.ts` に、React Queryに渡すオプションとキーを `@tanstack/react-query.gen.ts` に、Zodスキーマを `zod.gen.ts` に出力します。[Hey APIの生成設定](hey-api/openapi-ts.config.ts)

### 同じ保存操作をコードで追う

両版の画面は同じ手順で動きます。「編集」で開いたときに `editDraft` が詳細の値と `ETag` を下書きに記録し、「保存」で `save` が入力を検証して、そのタグを更新処理に渡します。まず画面側でこの流れを読み、各版の `api/use-areas.ts` で下の差を見比べてください。[編集を始める処理](orval/src/AreasPage.tsx#L29) · [保存ボタンから呼ばれる処理](orval/src/AreasPage.tsx#L100)

| 画面での操作 | Orval版 | Hey API版 |
| --- | --- | --- |
| 詳細を開く | 生成フック `useGetArea` の `select` が本文とヘッダーを受け取り、`{ area, etag }` にまとめます。[useAreaDetail](orval/src/api/use-areas.ts#L19) | 生成された `getAreaOptions` の結果は本文だけです。詳細では `useQuery` の取得関数から生成SDKの `getArea` を `responseStyle: 'fields'` で呼び、本文とヘッダーを受け取ります。[useAreaDetail](hey-api/src/api/use-areas.ts#L23) |
| 保存前に入力を検証する | `UpdateAreaBody` は、経度・緯度のペアを長さ2の数値配列として検証します。[areaInputSchema](orval/src/api/use-areas.ts#L10) | `zUpdateAreaBody` は同じペアを `[number, number]` のタプルとして検証します。担当者IDは生成Zodが `bigint` で返すので、安全な整数の範囲を検証した後、JSON送信用の `number` に戻します。[areaInputSchema](hey-api/src/api/use-areas.ts#L11) |
| 下書きを保存する | 生成フック `useUpdateArea` を使い、保存時に `areaId`、`data`、型付きの `headers` を渡します。`If-Match` は必須です。[useAreaActions](orval/src/api/use-areas.ts#L32) | `useMutation(updateAreaMutation())` を使い、保存時に `path`、型付きの `headers`、`body` を渡します。[useAreaActions](hey-api/src/api/use-areas.ts#L38) |
| 他のタブが先に保存した場合 | 生成クライアントが例外に付けたHTTPステータスを `error.status === 412` で確認します。[isAreaConflict](orval/src/api/use-areas.ts#L55) | 生成クライアントが例外として渡すエラー本文から `error.code === 'area_version_mismatch'` を確認します。[isAreaConflict](hey-api/src/api/use-areas.ts#L61) |
| 更新に成功したら一覧・詳細を取り直す | `getListAreasQueryKey()` と `getGetAreaQueryKey(areaId)` を `invalidateQueries` に渡します。[更新後の再取得](orval/src/api/use-areas.ts#L44) | `listAreasQueryKey()` と `getAreaQueryKey({ path: { areaId } })` を渡します。詳細を取得するときも同じ生成キーを使います。[更新後の再取得](hey-api/src/api/use-areas.ts#L50) |

どちらも保存前にZodで入力の構造を検証し、さらに `polygonError` で外周の閉じ方や自己交差を調べます。競合時は共通の `refreshLatest` が詳細を取り直し、下書きを残したまま最新の形状を表示します。「最新の形状から編集し直す」を押したとき、新しいタグで編集を始めます。[多角形の検証](orval/src/area-geometry.ts) · [競合後の再取得](orval/src/AreasPage.tsx#L88) · [再編集のボタン](orval/src/AreasPage.tsx#L217)

### ブラウザーでリクエストと応答を見比べる

下の「ブラウザーでの確認」の手順4を両版で試し、開発者ツールのネットワーク欄を見比べます。たとえばエリア7の版が1から始まる場合、どちらの版でも次の順で確認できます。

| 操作 | リクエストと応答 |
| --- | --- |
| 両タブで同じエリアを開く | `GET /api/areas/7` → `200`、`ETag: "area-7-v1"` |
| 第1タブで保存する | `PUT /api/areas/7` に `If-Match: "area-7-v1"` → `200`、`ETag: "area-7-v2"` |
| 第2タブで保存し、競合する | 同じ `If-Match: "area-7-v1"` → `412`、エラー本文の `code` は `area_version_mismatch` |
| 第2タブが最新の形状を取得する | `GET /api/areas/7` → `200`、`ETag: "area-7-v2"` |
| 第2タブで最新の形状から編集し直し、保存する | `PUT /api/areas/7` に `If-Match: "area-7-v2"` → `200` |

## ブラウザーでの確認

1. 管理者でログインし、「ユーザー管理」で担当者を作成します。「担当エリア」の「新規エリア」を押して名前と担当者を指定します。地図で頂点を3点以上クリックし、最初の頂点をクリックして外周を閉じます。「保存」し、再読み込みして一覧と地図に形状が表示されることを確認します。
2. エリアを選んで「編集」を開きます。辺をドラッグして頂点を追加し、頂点をドラッグして移動します。Altキーを押しながら頂点をクリックすると削除できます。キャンセルすると元の形状に戻ることを確認します。
3. 辺が交差する形状を描くか、頂点を動かして交差させます。保存を試すと理由が表示され、下書きが残ります。 [Swagger UI](http://127.0.0.1:8080/swagger/) でもログインし、`POST /areas` のサンプルから交差する外周に変えて送ると、`400` と `fieldErrors.geometry` が返ります。
4. 選んだエリアのURLを同じブラウザーの第2タブで開き、両タブで編集を始めます。各タブで異なる変更を加え、第1タブから保存します。第2タブの保存は `412` になります。下書きと最新の形状を確認し、「最新の形状から編集し直す」を押して必要な変更を適用し、保存します。ネットワーク欄では詳細の `ETag` と更新の `If-Match` を確認できます。
5. 別のブラウザープロファイルで担当者としてログインし、自分のエリアだけが表示されることを確認します。自分のエリアの形状は編集できます。担当外のエリアURLを開くと詳細APIが `403` を返します。
