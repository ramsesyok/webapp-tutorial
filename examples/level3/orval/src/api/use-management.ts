import { useQueryClient } from '@tanstack/react-query';
import {
  getGetPlaceQueryKey, getListAssignmentHistoryQueryKey, getListPlacesQueryKey, getListUsersQueryKey,
  useCreateUser, useDisableUser, useListAssignmentHistory, useListUsers, useSetPlaceAssignee,
  type CreateUserInput,
} from './generated/places';

export type { CreateUserInput, User } from './generated/places';

export function useUsers() {
  return useListUsers({ query: { select: (response) => response.data } });
}

export function useAssignmentHistory(placeId: number) {
  return useListAssignmentHistory(placeId, { query: { select: (response) => response.data } });
}

export function useUserActions() {
  const client = useQueryClient();
  const create = useCreateUser({ mutation: { gcTime: 0 } });
  const disable = useDisableUser();

  return {
    async createUser(input: CreateUserInput) {
      try {
        await create.mutateAsync({ data: input });
      } finally {
        // 作成時のパスワードをミューテーションキャッシュに残さない。
        create.reset();
      }
      await client.invalidateQueries({ queryKey: getListUsersQueryKey() });
    },
    async disableUser(userId: number) {
      await disable.mutateAsync({ userId });
      await client.invalidateQueries({ queryKey: getListUsersQueryKey() });
    },
  };
}

export function useAssignmentAction(placeId: number) {
  const client = useQueryClient();
  const assignment = useSetPlaceAssignee();

  return {
    isSaving: assignment.isPending,
    async save(assigneeId: number | null) {
      await assignment.mutateAsync({ placeId, data: { assigneeId } });
      // 担当の表示、地図と一覧で使う検索結果、拠点の履歴を取り直す。
      await Promise.all([
        client.invalidateQueries({ queryKey: getGetPlaceQueryKey(placeId), exact: true }),
        client.invalidateQueries({ queryKey: getListPlacesQueryKey() }),
        client.invalidateQueries({ queryKey: getListAssignmentHistoryQueryKey(placeId), exact: true }),
      ]);
    },
  };
}
