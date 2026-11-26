import { useQueryClient } from '@tanstack/react-query';
import {
  getGetSessionQueryKey, useCreateSession, useDeleteSession, useGetSession, type LoginInput,
} from './generated/places';

export type { LoginInput } from './generated/places';

export const sessionQueryKey = getGetSessionQueryKey();

export function useSession() {
  // Orvalの生成フックはHTTPレスポンス全体を受け取る。画面には本文のユーザーを渡す。
  return useGetSession({ query: { select: (response) => response?.data ?? null } });
}

export function useSessionActions() {
  const client = useQueryClient();
  const create = useCreateSession({ mutation: { gcTime: 0 } });
  const remove = useDeleteSession();

  return {
    async login(input: LoginInput) {
      try {
        const response = await create.mutateAsync({ data: input });
        client.setQueryData(sessionQueryKey, response);
      } finally {
        // ログインに使ったパスワードをミューテーションキャッシュに残さない。
        create.reset();
      }
    },
    async logout() {
      await remove.mutateAsync();
    },
    isLoggingOut: remove.isPending,
  };
}
