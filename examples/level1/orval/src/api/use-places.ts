import { useQueryClient } from '@tanstack/react-query';
import { parsePlaceError, type PlaceInput, type SearchFilters } from '../places';
import {
  getGetPlaceQueryKey,
  getListPlacesQueryKey,
  useCreatePlace,
  useDeletePlace,
  useGetPlace,
  useListPlaces,
  useUpdatePlace,
} from './generated/places';

// Orvalが生成したフックを呼ぶ。HTTPレスポンスから画面で使う本文を取り出す。
export function usePlaces(filters: SearchFilters) {
  return useListPlaces(filters, { query: { select: (response) => response.data } });
}

export function usePlace(id: number | undefined) {
  return useGetPlace(id ?? 0, {
    query: { enabled: id !== undefined, select: (response) => response.data },
  });
}

export function getApiError(error: unknown) {
  // OrvalのFetchクライアントはHTTPエラー本文を Error.info に格納する。
  const body = error && typeof error === 'object' && 'info' in error ? error.info : error;
  return parsePlaceError(body, error);
}

export function usePlaceMutations() {
  const client = useQueryClient();
  const create = useCreatePlace();
  const update = useUpdatePlace();
  const remove = useDeletePlace();

  // パラメーターなしのキーで、検索条件ごとの一覧キャッシュをすべて再取得対象にする。
  const invalidateLists = () => client.invalidateQueries({ queryKey: getListPlacesQueryKey() });

  return {
    async create(body: PlaceInput) {
      const response = await create.mutateAsync({ data: body });
      await invalidateLists();
      return response.data;
    },
    async update(id: number, body: PlaceInput) {
      const response = await update.mutateAsync({ placeId: id, data: body });
      await Promise.all([
        invalidateLists(),
        client.invalidateQueries({ queryKey: getGetPlaceQueryKey(id), exact: true }),
      ]);
      return response.data;
    },
    async remove(id: number) {
      await remove.mutateAsync({ placeId: id });
      client.removeQueries({ queryKey: getGetPlaceQueryKey(id), exact: true });
      await invalidateLists();
    },
  };
}
