import ExploreRounded from '@mui/icons-material/ExploreRounded';
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router';
import { AreasPage } from './AreasPage';
import { getApiError, isUnauthenticated } from './api/errors';
import { clearSession } from './api/query-client';
import { useSession, useSessionActions, type LoginInput } from './api/use-session';
import { LoginForm } from './LoginForm';
import { PlacesPage } from './PlacesPage';
import { UserManagement } from './UserManagement';

export function App() {
  const session = useSession();
  const { login, logout, isLoggingOut } = useSessionActions();
  const [logoutError, setLogoutError] = useState('');
  const [showUsers, setShowUsers] = useState(false);
  const isAdmin = session.data?.role === 'admin';

  async function signIn(input: LoginInput) {
    setLogoutError('');
    setShowUsers(false);
    await login(input);
  }

  async function signOut() {
    setLogoutError('');
    try {
      await logout();
      clearSession();
    } catch (error) {
      // 期限切れの場合も、共通のエラー処理がログイン画面へ切り替える。
      if (!isUnauthenticated(error)) setLogoutError(getApiError(error).message);
    }
  }

  return (
    <>
      <header className="app-header">
        <div className="heading">
          <div className="brand-icon"><ExploreRounded /></div>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 750 }}>訪問拠点マップ</Typography>
        </div>
        {session.data && (
          <Stack className="session-actions" direction="row" sx={{ alignItems: 'center' }} spacing={1.5}>
            <Typography variant="body2" noWrap title={session.data.loginId}>
              {session.data.loginId}（{isAdmin ? '管理者' : '担当者'}）
            </Typography>
            {isAdmin && <Button color="inherit" size="small" onClick={() => setShowUsers(true)}>ユーザー管理</Button>}
            <Button variant="outlined" color="inherit" size="small" onClick={signOut} disabled={isLoggingOut}>
              {isLoggingOut ? 'ログアウト中…' : 'ログアウト'}
            </Button>
          </Stack>
        )}
      </header>
      {session.isPending ? (
        <main className="session-panel">
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }} role="status">
            <CircularProgress size={20} />
            <Typography>ログイン状態を確認しています。</Typography>
          </Stack>
        </main>
      ) : session.isError ? (
        <main className="session-panel">
          <Alert severity="error" action={
            <Button color="inherit" onClick={() => session.refetch()} disabled={session.isFetching}>再試行</Button>
          }>ログイン状態を確認できませんでした。</Alert>
        </main>
      ) : session.data ? (
        <>
          {logoutError && <Alert severity="error" className="session-notice" onClose={() => setLogoutError('')}>
            {logoutError}
          </Alert>}
          <Stack component="nav" aria-label="地図の切り替え" className="map-navigation" direction="row" spacing={1}>
            <Button component={NavLink} to="/" end>訪問拠点</Button>
            <Button component={NavLink} to="/areas">担当エリア</Button>
          </Stack>
          <Routes>
            <Route path="/areas" element={<AreasPage key={session.data.id} user={session.data} />} />
            <Route path="*" element={<PlacesPage key={session.data.id} user={session.data} />} />
          </Routes>
          {isAdmin && showUsers && <UserManagement onClose={() => setShowUsers(false)} />}
        </>
      ) : (
        // URLを保ったまま画面を切り替えると、ログイン後に拠点IDと検索条件をそのまま読める。
        <LoginForm onLogin={signIn} />
      )}
    </>
  );
}
