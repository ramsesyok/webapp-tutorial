# OrvalとHey APIの技術比較

Webアプリの実装経験がある技術者向けに、Orval `8.49.0` と Hey API（`@hey-api/openapi-ts` `0.99.0`）を比較します。実装例は各レベルで同じOpenAPI定義、Goバックエンド、画面操作を使います。通常のJSON取得では、Orvalの生成フックと、Hey APIが生成するTanStack Query用オプションの使い方を比べます。Lv4まで進むと、型付きリクエストヘッダー、応答ヘッダー、ステータスを含む更新処理まで評価できます。 [実装例の一覧](README.md#学習資料)

| レベル | 主に比較すること |
| --- | --- |
| [Lv0](#lv0-api呼び出しとキャッシュ) | 生成フックと生成オプション、HTTPエラー、検索条件ごとのキャッシュ |
| [Lv1](#lv1-フォームと生成zod) | 生成したZodスキーマの組み込み、項目別エラー、生成後の補正 |
| [Lv2](#lv2-cookieセッション) | ログイン結果のキャッシュと、`401` の理由に応じた画面の切り替え |
| [Lv3](#lv3-権限と複数の再取得) | 権限エラーの取り扱いと、1回の更新で影響する複数のクエリ |
| [Lv4](#lv4-担当エリアの編集競合) | `ETag` と `If-Match` の受け渡し、`412` の判定と下書きの復元 |

## 生成設定と成果物

評価するレベルの起動手順に従い、両版を対応するバックエンドに接続します。比較する操作は同じ初期データで始めます。それぞれの実装例ディレクトリで `npm ci` のあと `npm run generate:api` を実行すると、`src/api/generated/` を読めます。`npm run dev` と `npm run build` も事前にコードを生成します。

| 観点 | Orval | Hey API |
| --- | --- | --- |
| 生成設定 | `orval.config.ts` で `client: 'react-query'` と `httpClient: 'fetch'` を選び、OpenAPIの `servers` から `/api` を取り込む。Lv1以降は `client: 'zod'` の出力を追加する | `openapi-ts.config.ts` でTypeScript、Fetchクライアント、SDK、TanStack Queryをプラグインとして指定する。Lv1以降は `zod` を追加する |
| 生成物 | API型、Fetch関数、React Queryフック、クエリキーを `places.ts` に生成する。Zodは `validation.ts` に出力する | API型は `types.gen.ts`、SDKの操作関数は `sdk.gen.ts`、クエリ・ミューテーションのオプションとキーは `@tanstack/react-query.gen.ts` に生成する。Zodは `zod.gen.ts` に出力する |
| アプリからの呼び出し | 操作単位の生成フックを呼ぶ。Fetch応答の本文、ステータス、ヘッダーを取得でき、一覧などでは `select` で本文を取り出す | TanStack Queryの `useQuery`、`useMutation` に生成オプションを渡す。この構成の生成オプションは成功時に本文を返す。応答全体が必要な箇所ではSDKの操作関数を呼ぶ |

生成済みの関数と、`src/api/` にあるアプリ側のフックを順に読むと、HTTP通信と画面向けの処理をたどれます。 [Orvalの設定](../examples/level4/orval/orval.config.ts) · [Hey APIの設定](../examples/level4/hey-api/openapi-ts.config.ts)

## Lv0 API呼び出しとキャッシュ

拠点の検索・詳細取得と、登録・編集・削除を比べます。選択した拠点IDと適用済みの検索条件はURLに保存し、地図での位置指定モードはZustandで管理します。一覧と詳細はTanStack Queryで取得し、フォームは両版で同じ手書きのZodスキーマを使います。 [Lv0の起動・確認手順](../examples/level0/README.md)

| 処理 | Orval | Hey API |
| --- | --- | --- |
| 一覧・詳細取得 | `useListPlaces(filters, …)`、`useGetPlace(id, …)` を呼ぶ。キャッシュには元の応答が入り、画面は `select` で `response.data` を受け取る | `listPlacesOptions({ query: filters })` と `getPlaceOptions({ path: { placeId } })` を `useQuery` に渡す。キャッシュと画面は本文を受け取る |
| 登録・編集・削除 | `useCreatePlace`、`useUpdatePlace`、`useDeletePlace` を呼ぶ。更新の変数は `{ placeId, data }` | `createPlaceMutation()`、`updatePlaceMutation()`、`deletePlaceMutation()` を `useMutation` に渡す。更新の変数は `{ path: { placeId }, body }` |
| 一覧キャッシュの無効化 | `getListPlacesQueryKey()` を使う。検索条件付きの一覧は同じ先頭要素を持つ | `listPlacesQueryKey()` を使う。検索条件付きの一覧は同じ操作IDとベースURLを持つオブジェクトキーの部分一致で対象になる |
| APIのJSONエラー | `forceSuccessResponse: true` により非2xxで例外を投げる。ステータスは `error.status`、本文は `error.info` に入る | 生成オプションがFetchクライアントに `throwOnError: true` を渡す。APIのJSONエラーでは本文が例外になる |

両版とも編集後は対象の詳細と検索条件ごとの一覧を無効化し、表示中のクエリを再取得します。削除後は対象の詳細をキャッシュから除去して一覧を再取得します。別タブで拠点を削除してから元のタブのフォームを保存すると、`404` のエラーがどこから画面に届くかを追えます。 [Orvalの拠点フック](../examples/level0/orval/src/api/use-places.ts) · [Hey APIの拠点フック](../examples/level0/hey-api/src/api/use-places.ts)

拠点一覧APIから本文が空の `500` が返ると、現在のOrval版はエラー欄が空になります。HTML本文の `500` ではJSON解析エラーが表示されます。Hey API版はいずれも接続失敗のメッセージを表示します。障害時の挙動を評価するときは、API定義どおりのJSONエラーと、プロキシなどが返す応答を分けて試します。 [画面向けのエラー変換](../examples/level0/orval/src/places.ts#L47)

VS CodeのCodeTourでも、生成設定、クエリ、更新、キャッシュキー、エラーの順に両版を読めます。 [Lv0の技術比較ツアー](../.tours/level0/compare/orval-vs-hey-api.tour)

## Lv1 フォームと生成Zod

`resolvePlaceDraft` は座標欄の文字列を数値に変換し、`validatePlaceInput` で登録・更新に応じたスキーマを `safeParse` します。地図では座標用のスキーマで位置を検証し、有効な入力を編集中のピンに反映します。名前とメモの長さはOpenAPIに合わせてコードポイント数で判定するため、ZodがUTF-16コード単位で上限超過と判定した項目は数え直します。 [Orvalのフォーム検証](../examples/level1/orval/src/places.ts) · [Hey APIのフォーム検証](../examples/level1/hey-api/src/places.ts)

| 処理 | Orval | Hey API |
| --- | --- | --- |
| 登録・更新のZod検証 | `CreatePlaceBody` と `UpdatePlaceBody` を使う | `zCreatePlaceBody` と `zUpdatePlaceBody` を使う |
| 座標のZod検証 | `PlaceMapFields.pick` で経度と緯度の制約を再利用する | `zPlaceMapFields.pick` で同じ制約を再利用する |
| `400` の項目別エラー | `getApiError` が `error.info` から `fieldErrors` を取り出す | `getApiError` が例外の本文から `fieldErrors` を取り出す |

緯度に `100` を入れて保存を押すと、HTTPリクエストの送信前に緯度欄へ理由が表示されます。Swagger UIから同じ不正値を送ると `400` の `fieldErrors.latitude` を確認できます。フォームからの保存で項目別エラーを受け取ったときは、両版がReact Hook Formの `setError` で対応する欄に理由を表示し、下書きを保ちます。 [Lv1の確認手順](../examples/level1/README.md#確認手順) · [フォームのエラー処理](../examples/level1/orval/src/PlaceEditor.tsx#L35) · [Orvalのエラー変換](../examples/level1/orval/src/api/use-places.ts) · [Hey APIのエラー変換](../examples/level1/hey-api/src/api/use-places.ts)

Hey API `0.99.0` は、このOpenAPI定義の名前用の正規表現に `U+2028` と `U+2029` を直接出力します。Lv1〜Lv4のHey API版では、`npm run generate:api` が生成後に両文字をエスケープします。名前の制約を維持したままコンパイルするための工程です。 [生成後の補正スクリプト](../examples/level1/hey-api/scripts/escape-zod-line-separators.mjs)

## Lv2 Cookieセッション

ブラウザーは同一オリジンのCookieを送信します。SPAは起動時に `GET /api/session` で認証状態を確認し、ログイン成功後にユーザーをキャッシュへ入れます。ログアウト成功時やセッション失効時には、拠点のクエリとミューテーションのキャッシュを消去します。 [レベル2のOpenAPI定義](../schema/level2/openapi.yaml) · [セッション失効時の処理](../examples/level2/orval/src/api/query-client.ts)

| 処理 | Orval | Hey API |
| --- | --- | --- |
| セッション取得 | `useGetSession` の `select` で `response.data` を取り出す | `getSessionOptions()` を `useQuery` に渡し、ユーザーの本文を受け取る |
| ログイン・ログアウト | `useCreateSession` と `useDeleteSession` を使う。ログイン入力は `data` に渡し、取得時と同じ応答の形をキャッシュに入れる | `createSessionMutation()` と `deleteSessionMutation()` を `useMutation` に渡す。ログイン入力は `body` に渡し、ユーザーの本文をキャッシュに入れる |
| `401` の理由 | `Error.info.code` を読む | 例外として渡るエラー本文の `code` を読む |

誤ったパスワードの `INVALID_CREDENTIALS` はログインフォームに表示します。認証済み画面で `UNAUTHENTICATED` を受け取るとログイン画面に切り替え、開いていた拠点URLは保持します。未ログインで拠点URLを直接開き、ログイン後の表示、再読み込み、ログアウトを両版で試すと、キャッシュと画面の関係を確認できます。 [Lv2の確認手順](../examples/level2/README.md#ブラウザーでの確認) · [Orvalのセッションフック](../examples/level2/orval/src/api/use-session.ts) · [Hey APIのセッションフック](../examples/level2/hey-api/src/api/use-session.ts)

## Lv3 権限と複数の再取得

管理者が担当者を作成して拠点に割り当てます。ユーザー作成・無効化の成功後はユーザー一覧を再取得し、担当変更の成功後は対象拠点の詳細、検索条件ごとの拠点一覧、対象拠点の担当変更履歴を再取得します。無効化した担当者のセッションは失効します。割り当ては保持され、管理者が変更または解除できます。 [Lv3の起動・確認手順](../examples/level3/README.md)

| 処理 | Orval | Hey API |
| --- | --- | --- |
| 一覧・履歴 | `useListUsers` と `useListAssignmentHistory` の `select` で本文を取り出す | `listUsersOptions` と `listAssignmentHistoryOptions` を `useQuery` に渡し、本文を受け取る |
| 担当の更新 | `useSetPlaceAssignee` の `mutateAsync` に `{ placeId, data: { assigneeId } }` を渡す | `useMutation(setPlaceAssigneeMutation())` の `mutateAsync` に `{ path: { placeId }, body: { assigneeId } }` を渡す |
| 再取得する詳細・履歴 | `getGetPlaceQueryKey(placeId)` と `getListAssignmentHistoryQueryKey(placeId)` を完全一致で無効化する | `getPlaceQueryKey({ path: { placeId } })` と `listAssignmentHistoryQueryKey({ path: { placeId } })` を完全一致で無効化する |

担当の変更後、ネットワーク欄で3種類のGETが再送されることと、画面に履歴が増えることを確認します。別のブラウザープロファイルでは担当者でログインし、担当外の詳細を開いて、ネットワーク欄で `403`、画面で権限エラーを確認します。Lv2のセッション失効時は `UNAUTHENTICATED` のコードでログイン画面へ遷移します。 [Orvalの管理フック](../examples/level3/orval/src/api/use-management.ts) · [Hey APIの管理フック](../examples/level3/hey-api/src/api/use-management.ts)

## Lv4 担当エリアの編集競合

両版とも、`editDraft` が詳細取得時の形状と `ETag` を下書きに記録します。`save` は生成Zodで入力の構造を検証し、`polygonError` で外周の閉じ方や自己交差などを検証します。更新時は編集開始時点のタグを引用符ごと `If-Match` に渡します。 [下書きの作成](../examples/level4/orval/src/AreasPage.tsx#L29) · [保存処理](../examples/level4/orval/src/AreasPage.tsx#L100) · [多角形の検証](../examples/level4/orval/src/area-geometry.ts) · [レベル4のOpenAPI定義](../schema/level4/openapi.yaml)

| 処理 | Orval | Hey API |
| --- | --- | --- |
| 保存前のZod検証 | `UpdateAreaBody` が座標ペアを長さ2の数値配列として検証する。担当者IDは `number` として検証する | `zUpdateAreaBody` が座標ペアを `[number, number]` のタプルとして検証する。OpenAPIの範囲を検証した担当者IDを `bigint` からJSON送信用の `number` に戻す |
| 応答から `ETag` を読む | `useGetArea` の `select` で本文と `headers.get('ETag')` を `{ area, etag }` にまとめる | `getAreaOptions` で構成したクエリは本文を返す。詳細は `useQuery` の取得関数からSDKの `getArea` を `responseStyle: 'fields'` で呼び、`response.headers` を読む |
| 必須の `If-Match` を送る | `output.headers: true` で生成した `useUpdateArea` の `mutateAsync` に `{ areaId, data, headers: { 'If-Match': etag } }` を渡す | `useMutation(updateAreaMutation())` の `mutateAsync` に `{ path: { areaId }, body, headers: { 'If-Match': etag } }` を渡す |
| 競合を判定する | 例外に入る `error.status === 412` を使う | 生成ミューテーションが投げる本文の `error.code === 'area_version_mismatch'` を使う |
| 更新後に再取得する | `getListAreasQueryKey()` と `getGetAreaQueryKey(areaId)` を無効化する | `listAreasQueryKey()` と `getAreaQueryKey({ path: { areaId } })` を無効化する。詳細取得にも同じ生成キーを使う |

`If-Match` の引数は両版で必須の文字列です。その形式と現在の版との一致はサーバーが検証します。Hey APIでHTTPステータスそのものを判定に使う場合は、生成SDKを `responseStyle: 'fields'`、`throwOnError: false` で呼び、`response.status` を確認できます。現在の画面は上表の競合判定を使い、更新成功時は一覧と表示中の詳細の再取得を待ちます。 [Orvalのエリアフック](../examples/level4/orval/src/api/use-areas.ts) · [Hey APIのエリアフック](../examples/level4/hey-api/src/api/use-areas.ts)

### 2タブで確認するHTTP通信

両版で同じ形状を使い、2タブで同じエリアを編集します。エリア7の版が1から始まる場合、開発者ツールのネットワーク欄で次のリクエストと応答を確認できます。 [Lv4のブラウザー確認手順](../examples/level4/README.md#ブラウザーでの確認)

| 操作 | リクエストと応答 |
| --- | --- |
| 両タブで同じエリアを開く | `GET /api/areas/7` → `200`、`ETag: "area-7-v1"` |
| 第1タブで保存する | `PUT /api/areas/7` に `If-Match: "area-7-v1"` → `200`、`ETag: "area-7-v2"` |
| 第2タブで保存する | 同じ `If-Match: "area-7-v1"` → `412`、エラー本文の `code` は `area_version_mismatch` |
| 第2タブが最新の形状を取得する | `GET /api/areas/7` → `200`、`ETag: "area-7-v2"` |
| 第2タブで最新の形状から編集し直し、保存する | `PUT /api/areas/7` に `If-Match: "area-7-v2"` → `200` |

競合時は `refreshLatest` が詳細を再取得し、下書きと最新の形状を地図に描き分けます。取得に失敗しても下書きは残り、再試行できます。「最新の形状から編集し直す」を押したときに新しいタグで編集を始めます。この間にどの版を保持し、どのタイミングで取り直すかは両版の画面コードで共通です。 [競合後の再取得](../examples/level4/orval/src/AreasPage.tsx#L88) · [再編集の操作](../examples/level4/orval/src/AreasPage.tsx#L217)

## 採用時の評価軸

- **通常のAPI追加**では、一覧と更新を一つずつ読み、OpenAPIの `operationId` から型、呼び出し、画面で使うデータまで追います。Orvalは操作単位の生成フックからたどれます。Hey APIはTanStack Queryのフックと、操作ごとの生成オプションの組み合わせが呼び出し箇所に表れます。 [Lv0の比較](#lv0-api呼び出しとキャッシュ)
- **フォームの契約変更**では、座標範囲や名前の長さを変更した場合に、再生成で反映される制約と、アプリ側で維持する補正を確かめます。Lv1のコードポイント数の扱いは両版で共通です。生成後の正規表現補正やLv4の `int64` からの変換は、現在のHey API版の保守項目です。 [Lv1の比較](#lv1-フォームと生成zod) · [Lv4の比較](#lv4-担当エリアの編集競合)
- **更新後の整合性**では、再取得する一覧・詳細・履歴と、画面が保存完了に進むタイミングを確認します。あわせて、ログアウト・セッション失効後に前のユーザーの表示が消えることを確かめます。 [Lv2の比較](#lv2-cookieセッション) · [Lv3の比較](#lv3-権限と複数の再取得)
- **版付き更新やエラー処理**では、ヘッダーの型、応答メタデータ、競合時の下書き保持までを一連の操作として追います。応答ヘッダーを使う操作が多い場合はOrvalの生成フックでどこまで完結するか、Hey APIではSDKを直接呼ぶ箇所がどれだけ増えるかを確認します。 [Lv4の比較](#lv4-担当エリアの編集競合)

## 備考

- **Orval 8.49.0** は、OpenAPIの操作を起点に、型・Fetch関数・React Queryフックをまとめて追えます。この教材の構成では、`ETag` の取得から型付きの `If-Match` の送信、`412` のステータス判定までを生成フックで扱えます。通常のJSON取得では `select` で本文を取り出します。 [生成設定](../examples/level4/orval/orval.config.ts) · [エリアのAPIフック](../examples/level4/orval/src/api/use-areas.ts)
- **Hey API 0.99.0** は、型・Fetch SDK・TanStack Query用オプションをプラグインで組み合わせます。通常の取得では、`useQuery` に生成オプションを渡して本文をそのまま使えます。更新の `path`・`headers`・`body` が呼び出し箇所に表れ、応答ヘッダーやHTTPステータスが必要な操作では生成SDKを直接使えます。 [生成設定](../examples/level4/hey-api/openapi-ts.config.ts) · [エリアのAPIフック](../examples/level4/hey-api/src/api/use-areas.ts)
- **生成後に手を加える箇所**も比較に含めます。たとえばLv4では、Orvalは担当者IDを `number` として検証します。Hey APIは座標ペアをタプルとして、担当者IDを `bigint` として検証します。この教材のHey API版には、IDをJSON送信用に変換する処理と、生成した正規表現の補正があります。 [Lv1のZod生成](#lv1-フォームと生成zod) · [Lv4の入力検証](#lv4-担当エリアの編集競合)
- **Lv6のSSE通知**は、計画どおりブラウザーの `EventSource` を使う場合、通知後の一覧・詳細の再取得が主な比較点です。生成SDKで購読する試作では、Hey APIは接続中にイベントを順次受け取り、現行設定のOrvalで生成したFetch関数は応答の終了まで本文を待ちました。 [Lv6の学習計画](../tutorial-plan.md#レベル6担当変更と承認結果をsseで通知する)
- **Lv8のCSV入出力**は、Lv4までの比較に加えられる評価項目です。仮のOpenAPI定義を使った試作では、両版で `multipart/form-data` の送信、`202` の受付、CSVテキストの取得ができました。文字列を生の `text/csv` として送る場合は、Hey APIがそのまま送信し、現行設定のOrvalはJSON文字列化しました。 [Lv8の学習計画](../tutorial-plan.md#レベル8csvで拠点台帳を入出力する)
