import { Alert, Button, CircularProgress, List, ListItem, ListItemText, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useState, type FormEvent } from 'react';
import { getApiError } from './api/errors';
import { useAssignmentAction, useAssignmentHistory, useUsers } from './api/use-management';
import type { Place } from './places';

export function AssigneeForm({ place }: { place: Place }) {
  const users = useUsers();
  const assignment = useAssignmentAction(place.id);
  const [selected, setSelected] = useState(place.assigneeId === null ? '' : String(place.assigneeId));
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await assignment.save(selected === '' ? null : Number(selected));
    } catch (cause) {
      setError(getApiError(cause).message);
    }
  }

  if (users.isPending) return <CircularProgress size={20} aria-label="担当者候補を取得中" />;
  if (users.isError) return <Alert severity="error"
    action={<Button color="inherit" onClick={() => users.refetch()}>再試行</Button>}>
    {getApiError(users.error).message}
  </Alert>;

  const candidates = users.data.filter((user) => user.role === 'assignee' && (user.active || user.id === place.assigneeId));
  const hasChanges = selected !== (place.assigneeId === null ? '' : String(place.assigneeId));
  return (
    <Stack component="form" onSubmit={submit} spacing={1}>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1}>
        <TextField select label="担当者" size="small" fullWidth value={selected}
          onChange={(event) => setSelected(event.target.value)} disabled={assignment.isSaving}>
          <MenuItem value="">未割り当て</MenuItem>
          {candidates.map((user) => <MenuItem key={user.id} value={String(user.id)} disabled={!user.active}>
            {user.loginId}{!user.active && '（無効）'}
          </MenuItem>)}
        </TextField>
        <Button type="submit" variant="outlined" sx={{ flexShrink: 0 }} disabled={assignment.isSaving || !hasChanges}>
          担当を保存
        </Button>
      </Stack>
    </Stack>
  );
}

const formatDate = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'medium' });

export function AssignmentHistory({ placeId }: { placeId: number }) {
  const history = useAssignmentHistory(placeId);
  return (
    <section aria-labelledby="history-title">
      <Typography id="history-title" component="h4" variant="subtitle2">担当変更履歴</Typography>
      {history.isPending && <CircularProgress size={20} aria-label="変更履歴を取得中" />}
      {history.isError && <Alert severity="error"
        action={<Button color="inherit" onClick={() => history.refetch()}>再試行</Button>}>
        {getApiError(history.error).message}
      </Alert>}
      {history.isSuccess && (history.data.length === 0
        ? <Typography variant="body2" color="text.secondary">担当変更はまだありません。</Typography>
        : <List dense disablePadding>
          {history.data.map((change) => (
            <ListItem key={change.id} disableGutters>
              <ListItemText primary={`${change.previousAssigneeLoginId ?? '未割り当て'} → ${change.newAssigneeLoginId ?? '未割り当て'}`}
                secondary={`${change.actorLoginId} ・ ${formatDate.format(new Date(change.changedAt))}`} />
            </ListItem>
          ))}
        </List>
      )}
    </section>
  );
}
