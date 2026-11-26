import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlaceInput, SearchFilters } from '../places';
import {
  createPlaceMutation,
  deletePlaceMutation,
  getPlaceOptions,
  getPlaceQueryKey,
  listPlacesOptions,
  listPlacesQueryKey,
  updatePlaceMutation,
} from './generated/@tanstack/react-query.gen';

// Hey APIが生成したオプションをTanStack Queryのフックに渡す。
// 生成オプションがAPIを呼び、成功時は本文を返し、非2xxはrejectする。
export function usePlaces(filters: SearchFilters) {
  return useQuery(listPlacesOptions({ query: filters }));
}

export function usePlace(id: number | undefined) {
  return useQuery({
    ...getPlaceOptions({ path: { placeId: id ?? 0 } }),
    enabled: id !== undefined,
  });
}

export function usePlaceMutations() {
  const client = useQueryClient();
  const create = useMutation(createPlaceMutation());
  const update = useMutation(updatePlaceMutation());
  const remove = useMutation(deletePlaceMutation());

  // パラメーターなしのキーで、検索条件ごとの一覧キャッシュをすべて再取得対象にする。
  const invalidateLists = () => client.invalidateQueries({ queryKey: listPlacesQueryKey() });

  return {
    async create(body: PlaceInput) {
      const place = await create.mutateAsync({ body });
      await invalidateLists();
      return place;
    },
    async update(id: number, body: PlaceInput) {
      const place = await update.mutateAsync({ path: { placeId: id }, body });
      await Promise.all([
        invalidateLists(),
        client.invalidateQueries({ queryKey: getPlaceQueryKey({ path: { placeId: id } }), exact: true }),
      ]);
      return place;
    },
    async remove(id: number) {
      await remove.mutateAsync({ path: { placeId: id } });
      client.removeQueries({ queryKey: getPlaceQueryKey({ path: { placeId: id } }), exact: true });
      await invalidateLists();
    },
  };
}
