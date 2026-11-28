import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { areaNameSchema } from '../area-name';
import {
  createAreaMutation, getAreaQueryKey, listAreasOptions, listAreasQueryKey, updateAreaMutation,
} from './generated/@tanstack/react-query.gen';
import { getArea } from './generated/sdk.gen';
import type { Area, AreaInput } from './generated/types.gen';
import { zUpdateAreaBody } from './generated/zod.gen';
export type { Area } from './generated/types.gen';

// int64のZod出力はbigint。OpenAPIが安全な整数の範囲を検証するので、JSONへ送る前にnumberへ戻せる。
export const areaInputSchema = zUpdateAreaBody
  .extend({ name: areaNameSchema(zUpdateAreaBody.shape.name) })
  .transform((input) => ({ ...input, assigneeId: Number(input.assigneeId) }));

export type AreaDetail = { area: Area; etag: string };
type UpdateAreaRequest = { areaId: number; etag: string; input: AreaInput };

export function useAreas() {
  return useQuery(listAreasOptions());
}

export function useAreaDetail(areaId: number | undefined) {
  const options = { path: { areaId: areaId ?? 0 } };
  return useQuery({
    queryKey: getAreaQueryKey(options),
    enabled: areaId !== undefined,
    queryFn: async ({ signal }): Promise<AreaDetail> => {
      // 生成クエリの結果は本文なので、SDKから本文とレスポンスヘッダーを取得する。
      const { data, response } = await getArea({ ...options, signal, responseStyle: 'fields', throwOnError: true });
      const etag = response.headers.get('ETag');
      if (!etag) throw new Error('エリアの版を取得できませんでした。');
      return { area: data, etag };
    },
  });
}

export function useAreaActions() {
  const client = useQueryClient();
  const create = useMutation(createAreaMutation());
  const update = useMutation(updateAreaMutation());

  return {
    async createArea(input: AreaInput) {
      const data = await create.mutateAsync({ body: input });
      // 登録後に開く詳細のGETから、次の編集で使うETagも取得する。
      await client.invalidateQueries({ queryKey: listAreasQueryKey() });
      return data;
    },
    async updateArea({ areaId, etag, input }: UpdateAreaRequest) {
      await update.mutateAsync({ path: { areaId }, headers: { 'If-Match': etag }, body: input });
      // 一覧の図形と、詳細の図形・ETagをサーバーの最新状態に揃える。
      await Promise.all([
        client.invalidateQueries({ queryKey: listAreasQueryKey() }),
        client.invalidateQueries({ queryKey: getAreaQueryKey({ path: { areaId } }), exact: true }),
      ]);
    },
  };
}

export function isAreaConflict(error: unknown) {
  // 生成ミューテーションの例外には、APIが返したエラー本文が入る。
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'area_version_mismatch');
}
