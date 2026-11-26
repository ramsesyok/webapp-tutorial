import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { useMapStore } from '../map-store';
import { isUnauthenticated } from './errors';
import { sessionQueryKey } from './use-session';

export const queryClient = new QueryClient({
  defaultOptions: {
    // 演習では、通信エラーをすぐ表示して明示的に再試行できるようにする。
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 0 },
  },
  queryCache: new QueryCache({ onError: handleApiError }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      // ログアウト前の更新処理が遅れて失敗しても、新しいセッションへ影響させない。
      const isCurrent = queryClient.getMutationCache().getAll().some((entry) => entry.mutationId === mutation.mutationId);
      if (isCurrent) handleApiError(error);
    },
  }),
});

function handleApiError(error: unknown) {
  // ログイン失敗の401と、セッションが無効になった401をAPIのエラーコードで区別する。
  if (isUnauthenticated(error)) clearSession();
}

export function clearSession() {
  // 未ログインの状態を残し、拠点の取得結果や更新結果は次のログインに持ち越さない。
  queryClient.setQueryData(sessionQueryKey, null);
  const sessionQuery = queryClient.getQueryCache().find({ queryKey: sessionQueryKey, exact: true });
  queryClient.removeQueries({ predicate: (query) => query !== sessionQuery });
  queryClient.getMutationCache().clear();
  useMapStore.getState().setPicking(false);
}
