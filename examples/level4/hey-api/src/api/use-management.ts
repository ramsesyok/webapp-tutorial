import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createUserMutation, disableUserMutation, getPlaceQueryKey, listAssignmentHistoryOptions,
  listAssignmentHistoryQueryKey, listPlacesQueryKey, listUsersOptions, listUsersQueryKey, setPlaceAssigneeMutation,
} from './generated/@tanstack/react-query.gen';
import type { CreateUserData } from './generated/types.gen';

export type { User } from './generated/types.gen';
export type CreateUserInput = CreateUserData['body'];

export function useUsers(enabled = true) {
  return useQuery({ ...listUsersOptions(), enabled });
}

export function useAssignmentHistory(placeId: number) {
  return useQuery(listAssignmentHistoryOptions({ path: { placeId } }));
}

export function useUserActions() {
  const client = useQueryClient();
  const create = useMutation({ ...createUserMutation(), gcTime: 0 });
  const disable = useMutation(disableUserMutation());

  return {
    async createUser(input: CreateUserInput) {
      try {
        await create.mutateAsync({ body: input });
      } finally {
        // 作成時のパスワードをミューテーションキャッシュに残さない。
        create.reset();
      }
      await client.invalidateQueries({ queryKey: listUsersQueryKey() });
    },
    async disableUser(userId: number) {
      await disable.mutateAsync({ path: { userId } });
      await client.invalidateQueries({ queryKey: listUsersQueryKey() });
    },
  };
}

export function useAssignmentAction(placeId: number) {
  const client = useQueryClient();
  const assignment = useMutation(setPlaceAssigneeMutation());
  const options = { path: { placeId } };

  return {
    isSaving: assignment.isPending,
    async save(assigneeId: number | null) {
      await assignment.mutateAsync({ ...options, body: { assigneeId } });
      // 担当の表示、地図と一覧で使う検索結果、拠点の履歴を取り直す。
      await Promise.all([
        client.invalidateQueries({ queryKey: getPlaceQueryKey(options), exact: true }),
        client.invalidateQueries({ queryKey: listPlacesQueryKey() }),
        client.invalidateQueries({ queryKey: listAssignmentHistoryQueryKey(options), exact: true }),
      ]);
    },
  };
}
