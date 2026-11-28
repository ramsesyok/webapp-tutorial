import { Alert, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useForm } from 'react-hook-form';
import { getApiError } from './api/errors';
import type { LoginInput } from './api/use-session';

type Props = { onLogin: (input: LoginInput) => Promise<void> };

export function LoginForm({ onLogin }: Props) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    defaultValues: { loginId: '', password: '' },
  });
  const { ref: loginIdRef, ...loginId } = register('loginId');
  const { ref: passwordRef, ...password } = register('password');
  const submit = handleSubmit(async (input) => {
    try {
      await onLogin(input);
    } catch (error) {
      setError('root.server', { type: 'server', message: getApiError(error).message });
    }
  });

  return (
    <main className="session-panel">
      <Paper component="section" variant="outlined" aria-labelledby="login-title">
        <Stack component="form" onSubmit={submit} spacing={2} sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Typography id="login-title" variant="h6" component="h2" sx={{ fontWeight: 700 }}>
            ログイン
          </Typography>
          {errors.root?.server?.message && <Alert severity="error">{errors.root.server.message}</Alert>}
          <TextField {...loginId} inputRef={loginIdRef} label="ログインID" autoComplete="username"
            required autoFocus disabled={isSubmitting} />
          <TextField {...password} inputRef={passwordRef} label="パスワード" type="password"
            autoComplete="current-password" required disabled={isSubmitting} />
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? 'ログイン中…' : 'ログイン'}
          </Button>
        </Stack>
      </Paper>
    </main>
  );
}
