import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSessionMutation, deleteSessionMutation, getSessionOptions, getSessionQueryKey,
} from './generated/@tanstack/react-query.gen';
import type { CreateSessionData } from './generated/types.gen';

export type LoginInput = CreateSessionData['body'];

export const sessionQueryKey = getSessionQueryKey();

export function useSession() {
  // Hey APIの生成オプションはレスポンス本文のユーザーを返す。
  return useQuery(getSessionOptions());
}

export function useSessionActions() {
  const client = useQueryClient();
  const create = useMutation({ ...createSessionMutation(), gcTime: 0 });
  const remove = useMutation(deleteSessionMutation());

  return {
    async login(input: LoginInput) {
      try {
        const user = await create.mutateAsync({ body: input });
        client.setQueryData(sessionQueryKey, user);
      } finally {
        // ログインに使ったパスワードをミューテーションキャッシュに残さない。
        create.reset();
      }
    },
    async logout() {
      await remove.mutateAsync({});
    },
    isLoggingOut: remove.isPending,
  };
}
