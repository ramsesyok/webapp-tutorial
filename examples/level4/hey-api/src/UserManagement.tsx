import {
  Alert, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  List, ListItem, ListItemText, Stack, TextField, Typography,
} from '@mui/material';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { getApiError } from './api/errors';
import { useUserActions, useUsers, type CreateUserInput, type User } from './api/use-management';

export function UserManagement({ onClose }: { onClose: () => void }) {
  const users = useUsers();
  const { createUser, disableUser } = useUserActions();
  const [toDisable, setToDisable] = useState<User>();
  const [isDisabling, setIsDisabling] = useState(false);
  const [disableError, setDisableError] = useState('');
  const [notice, setNotice] = useState('');
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<CreateUserInput>({
    defaultValues: { loginId: '', password: '' },
  });

  const { ref: loginIdRef, ...loginId } = register('loginId');
  const { ref: passwordRef, ...password } = register('password');

  const submit = handleSubmit(async (input) => {
    setNotice('');
    try {
      await createUser(input);
      reset();
      setNotice(`「${input.loginId}」を作成しました。`);
    } catch (error) {
      const { fieldErrors, message } = getApiError(error);
      if (fieldErrors.loginId) setError('loginId', { message: fieldErrors.loginId });
      if (fieldErrors.password) setError('password', { message: fieldErrors.password });
      setError('root.server', { message });
    }
  });

  async function confirmDisable(user: User) {
    setIsDisabling(true);
    setNotice('');
    setDisableError('');
    try {
      await disableUser(user.id);
      setToDisable(undefined);
      setNotice(`「${user.loginId}」を無効にしました。`);
    } catch (error) {
      setDisableError(getApiError(error).message);
    } finally {
      setIsDisabling(false);
    }
  }

  const busy = isSubmitting || isDisabling;
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="users-title">
      <DialogTitle id="users-title">ユーザー管理</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {notice && <Alert severity="success">{notice}</Alert>}
          <Stack component="form" onSubmit={submit} spacing={1.5}>
            <Typography component="h3" sx={{ fontWeight: 700 }}>担当者を作成</Typography>
            {errors.root?.server?.message && <Alert severity="error">{errors.root.server.message}</Alert>}
            <TextField {...loginId} inputRef={loginIdRef} label="ログインID" size="small" required
              error={Boolean(errors.loginId)} helperText={errors.loginId?.message ?? '半角英数字、ピリオド、アンダースコア、ハイフン'}
              autoComplete="off" disabled={busy || Boolean(toDisable)} slotProps={{ htmlInput: { maxLength: 64 } }} />
            <TextField {...password} inputRef={passwordRef} label="パスワード" size="small" type="password" required
              error={Boolean(errors.password)} helperText={errors.password?.message}
              autoComplete="new-password" disabled={busy || Boolean(toDisable)} />
            <Button type="submit" variant="contained" sx={{ alignSelf: 'flex-start' }} disabled={busy || Boolean(toDisable)}>
              作成
            </Button>
          </Stack>
          <Divider />
          <Typography component="h3" sx={{ fontWeight: 700 }}>ユーザー一覧</Typography>
          {users.isPending && <CircularProgress size={20} aria-label="ユーザーを取得中" />}
          {users.isError && <Alert severity="error"
            action={<Button color="inherit" onClick={() => users.refetch()}>再試行</Button>}>
            {getApiError(users.error).message}
          </Alert>}
          {users.isSuccess && <List disablePadding>
            {users.data.map((user) => (
              <ListItem key={user.id} disableGutters sx={{ gap: 1 }}>
                <ListItemText primary={user.loginId} secondary={user.role === 'admin' ? '管理者' : '担当者'} />
                <Chip label={user.active ? '有効' : '無効'} size="small" variant="outlined" />
                {user.role === 'assignee' && user.active && (
                  <Button size="small" color="error" disabled={busy || Boolean(toDisable)} onClick={() => setToDisable(user)}>
                    無効化
                  </Button>
                )}
              </ListItem>
            ))}
          </List>}
          {toDisable && <Alert severity="warning">
            「{toDisable.loginId}」を無効にして、現在のログインを終了させますか？
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button color="inherit" disabled={busy} onClick={() => { setToDisable(undefined); setDisableError(''); }}>キャンセル</Button>
              <Button color="error" variant="contained" disabled={busy} onClick={() => confirmDisable(toDisable)}>無効にする</Button>
            </Stack>
          </Alert>}
          {disableError && <Alert severity="error">{disableError}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose} disabled={busy}>閉じる</Button></DialogActions>
    </Dialog>
  );
}
