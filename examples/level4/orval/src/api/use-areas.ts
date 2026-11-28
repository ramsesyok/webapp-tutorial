import { useQueryClient } from '@tanstack/react-query';
import { areaNameSchema } from '../area-name';
import {
  getGetAreaQueryKey, getListAreasQueryKey, useCreateArea, useGetArea, useListAreas, useUpdateArea,
  type Area, type AreaInput,
} from './generated/places';
import { UpdateAreaBody } from './generated/validation';
export type { Area } from './generated/places';

export const areaInputSchema = UpdateAreaBody.extend({ name: areaNameSchema(UpdateAreaBody.shape.name) });

export type AreaDetail = { area: Area; etag: string };
type UpdateAreaRequest = { areaId: number; etag: string; input: AreaInput };

export function useAreas() {
  return useListAreas({ query: { select: (response) => response.data } });
}

export function useAreaDetail(areaId: number | undefined) {
  return useGetArea(areaId ?? 0, {
    query: {
      enabled: areaId !== undefined,
      select: (response): AreaDetail => {
        const etag = response.headers.get('ETag');
        if (!etag) throw new Error('エリアの版を取得できませんでした。');
        return { area: response.data, etag };
      },
    },
  });
}

export function useAreaActions() {
  const client = useQueryClient();
  const create = useCreateArea();
  const update = useUpdateArea();

  return {
    async createArea(input: AreaInput) {
      const { data } = await create.mutateAsync({ data: input });
      // 登録後に開く詳細のGETから、次の編集で使うETagも取得する。
      await client.invalidateQueries({ queryKey: getListAreasQueryKey() });
      return data;
    },
    async updateArea({ areaId, etag, input }: UpdateAreaRequest) {
      await update.mutateAsync({ areaId, data: input, headers: { 'If-Match': etag } });
      // 一覧の図形と、詳細の図形・ETagをサーバーの最新状態に揃える。
      await Promise.all([
        client.invalidateQueries({ queryKey: getListAreasQueryKey() }),
        client.invalidateQueries({ queryKey: getGetAreaQueryKey(areaId), exact: true }),
      ]);
    },
  };
}

export function isAreaConflict(error: unknown) {
  return error instanceof Error && 'status' in error && error.status === 412;
}
