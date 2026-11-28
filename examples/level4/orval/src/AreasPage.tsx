import {
  Alert, Button, CircularProgress, List, ListItemButton, ListItemText,
  Paper, Stack, TextField, Typography,
} from '@mui/material';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { getApiError, isUnauthenticated } from './api/errors';
import {
  areaInputSchema, isAreaConflict, useAreaActions, useAreaDetail, useAreas, type Area, type AreaDetail,
} from './api/use-areas';
import { useUsers, type User } from './api/use-management';
import { polygonError, type AreaGeometry } from './area-geometry';
import { AreaMap } from './AreaMap';

const emptyAreas: Area[] = [];
type Draft = {
  name: string;
  assigneeId: string;
  geometry?: AreaGeometry;
  editing?: { areaId: number; etag: string };
  reference?: AreaGeometry;
};
type Conflict =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; latest: AreaDetail };
type Errors = { name?: string; assigneeId?: string; geometry?: string; message?: string };

function editDraft({ area, etag }: AreaDetail): Draft {
  // 下書きとタグを同じレスポンスから作る。バックグラウンドで詳細が更新されても保存時のタグは固定する。
  return {
    name: area.name, assigneeId: String(area.assigneeId), geometry: area.geometry,
    editing: { areaId: area.id, etag },
  };
}

export function AreasPage({ user }: { user: User }) {
  const isAdmin = user.role === 'admin';
  const [params, setParams] = useSearchParams();
  const areaParam = params.get('area') ?? '';
  const areaId = /^[1-9]\d*$/.test(areaParam) && Number(areaParam) <= 2147483647 ? Number(areaParam) : undefined;
  const [draft, setDraft] = useState<Draft>();
  const [conflict, setConflict] = useState<Conflict>();
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const isOpen = useRef(false);
  useEffect(() => {
    isOpen.current = true;
    return () => { isOpen.current = false; };
  }, []);

  const list = useAreas();
  const selectedId = draft?.editing?.areaId ?? areaId;
  const detail = useAreaDetail(selectedId);
  const actions = useAreaActions();
  const users = useUsers(isAdmin);
  const areas = list.data ?? emptyAreas;
  const latest = conflict?.status === 'ready' ? conflict.latest : undefined;
  const selected = latest?.area ?? (detail.isSuccess ? detail.data.area : undefined);
  const locked = saving || conflict !== undefined;

  function selectArea(id: number) {
    if (draft) return;
    setNotice('');
    // IDをURLに持たせ、同じエリアを別タブで開いたり再読み込みしたりできるようにする。
    setParams({ area: String(id) });
  }

  function startDraft(next: Draft) {
    setDraft(next);
    setErrors({});
    setConflict(undefined);
    setNotice('');
  }

  function cancelDraft() {
    setDraft(undefined);
    setConflict(undefined);
    setErrors({});
  }

  function changeDraft(changes: Partial<Draft>) {
    setDraft((current) => current && { ...current, ...changes });
    setErrors({});
  }

  async function refreshLatest() {
    setConflict({ status: 'loading' });
    try {
      const result = await detail.refetch({ throwOnError: true });
      if (result.isError) throw result.error;
      if (!result.isSuccess) throw new Error('最新の形状を取得できませんでした。');
      setConflict({ status: 'ready', latest: result.data });
    } catch (error) {
      if (!isUnauthenticated(error)) setConflict({ status: 'failed', message: getApiError(error).message });
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || locked) return;
    const parsed = areaInputSchema.safeParse({
      name: draft.name, assigneeId: Number(draft.assigneeId), geometry: draft.geometry,
    });
    if (!parsed.success) {
      const fields: Errors = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'name') fields.name = '空白以外の文字を含む名前を80文字以内で入力してください。';
        if (issue.path[0] === 'assigneeId') fields.assigneeId = '担当者を選んでください。';
        if (issue.path[0] === 'geometry') fields.geometry = '外周が1本の多角形を頂点3〜200点で描いてください。';
      }
      setErrors(fields);
      return;
    }
    const geometryError = polygonError(parsed.data.geometry);
    if (geometryError) {
      setErrors({ geometry: geometryError });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (draft.editing) {
        await actions.updateArea({ ...draft.editing, input: parsed.data });
        setNotice('エリアを保存しました。');
      } else {
        const area = await actions.createArea(parsed.data);
        if (isOpen.current) setParams({ area: String(area.id) });
        setNotice('エリアを登録しました。');
      }
      cancelDraft();
    } catch (error) {
      if (draft.editing && isAreaConflict(error)) {
        // 最新の形状を取得してもここでは下書きや編集中のタグを置き換えない。
        await refreshLatest();
      } else if (!isUnauthenticated(error)) {
        const apiError = getApiError(error);
        setErrors({ ...apiError.fieldErrors, message: apiError.message });
      }
    } finally {
      setSaving(false);
    }
  }

  function assigneeName(id: number) {
    if (id === user.id) return user.loginId;
    return users.data?.find((item) => item.id === id)?.loginId ?? `ユーザー #${id}`;
  }

  const candidates = users.data?.filter((item) => item.role === 'assignee' &&
    (item.active || String(item.id) === draft?.assigneeId)) ?? [];

  return (
    <main className="workspace">
      <Paper component="section" variant="outlined" className="map-panel" aria-labelledby="area-map-title">
        <div className="panel-heading map-heading">
          <Typography id="area-map-title" component="h2" variant="h6">担当エリア地図</Typography>
        </div>
        <AreaMap areas={areas} selected={selected} selectedId={selectedId}
          hiddenAreaId={latest ? undefined : draft?.editing?.areaId}
          draft={draft?.geometry} reference={draft?.reference}
          mode={locked ? 'locked' : draft ? (draft.geometry ? 'modify' : 'draw') : 'view'}
          onSelect={selectArea} onGeometryChange={(geometry) => changeDraft({ geometry })} />
        {draft && (
          <div className="map-footer">
            {conflict
              ? latest ? '緑は最新の形状、橙は競合した下書きです。' : '橙は競合した下書きです。'
              : draft.geometry
                ? '頂点や辺をドラッグして編集します。Altキーを押しながら頂点をクリックすると削除できます。'
                : '地図をクリックして頂点を追加し、最初の頂点をクリックして外周を閉じます。'}
            {draft.reference && <span>紫の点線は前の下書きです。</span>}
          </div>
        )}
      </Paper>
      <div className="side-panel">
        <Paper component="section" variant="outlined" aria-labelledby="area-list-title">
          <div className="panel-heading">
            <Typography id="area-list-title" component="h2" variant="h6">担当エリア</Typography>
            {isAdmin && <Button variant="contained" disabled={Boolean(draft)}
              onClick={() => startDraft({ name: '', assigneeId: '' })}>新規エリア</Button>}
          </div>
          {list.isPending && <div className="list-message"><CircularProgress size={20} aria-label="エリア一覧を取得中" /></div>}
          {list.isError && <div className="list-message"><Alert severity="error"
            action={<Button color="inherit" onClick={() => list.refetch()}>再試行</Button>}>
            {getApiError(list.error).message}
          </Alert></div>}
          {list.isSuccess && areas.length === 0 && (
            <Typography className="list-message" color="text.secondary">表示できるエリアはありません。</Typography>
          )}
          <List className="place-list" disablePadding>
            {areas.map((area) => <ListItemButton key={area.id} selected={area.id === selectedId}
              disabled={Boolean(draft)} onClick={() => selectArea(area.id)}>
              <ListItemText primary={area.name} secondary={isAdmin ? assigneeName(area.assigneeId) : undefined} />
            </ListItemButton>)}
          </List>
        </Paper>
        {(draft || selectedId !== undefined) && (
          <Paper component="section" variant="outlined" aria-labelledby="area-detail-title">
            <div className="panel-heading">
              <Typography id="area-detail-title" component="h2" variant="h6">
                {draft ? (draft.editing ? 'エリアを編集' : 'エリアを登録') : 'エリアの詳細'}
              </Typography>
            </div>
            <div className="detail-content">
              {draft ? (
                <Stack component="form" onSubmit={save} spacing={1.5} noValidate>
                  {conflict && (
                    <Alert severity={conflict.status === 'failed' ? 'error' : 'warning'}>
                      <Stack spacing={1}>
                        <span>別の画面でエリアが更新されました。下書きは保持されています。</span>
                        {conflict.status === 'loading' && <span>最新の形状を取得しています。</span>}
                        {conflict.status === 'failed' && <>
                          <span>{conflict.message}</span>
                          <Button onClick={refreshLatest}>最新の形状を再取得</Button>
                        </>}
                        {latest && <Button onClick={() => startDraft({ ...editDraft(latest), reference: draft.geometry })}>
                          最新の形状から編集し直す
                        </Button>}
                      </Stack>
                    </Alert>
                  )}
                  {errors.message && <Alert severity="error">{errors.message}</Alert>}
                  <TextField label="エリア名" value={draft.name} disabled={locked} size="small"
                    error={Boolean(errors.name)} helperText={errors.name}
                    onChange={(event) => changeDraft({ name: event.target.value })} />
                  {isAdmin ? (
                    <TextField select label="担当者" value={draft.assigneeId} disabled={locked} size="small"
                      error={Boolean(errors.assigneeId)} helperText={errors.assigneeId}
                      slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                      onChange={(event) => changeDraft({ assigneeId: event.target.value })}>
                      <option value="">担当者を選択</option>
                      {draft.assigneeId && !candidates.some((item) => String(item.id) === draft.assigneeId) &&
                        <option value={draft.assigneeId}>{assigneeName(Number(draft.assigneeId))}</option>}
                      {candidates.map((item) => <option key={item.id} value={item.id} disabled={!item.active}>
                        {item.loginId}{!item.active && '（無効）'}
                      </option>)}
                    </TextField>
                  ) : <Typography variant="body2">担当者　{user.loginId}</Typography>}
                  {isAdmin && users.isError && <Alert severity="error"
                    action={<Button color="inherit" onClick={() => users.refetch()}>再試行</Button>}>
                    担当者の一覧を取得できませんでした。
                  </Alert>}
                  {isAdmin && !draft.editing && users.isSuccess && candidates.length === 0 && (
                    <Alert severity="info">ユーザー管理で有効な担当者を作成してください。</Alert>
                  )}
                  {errors.geometry && <Alert severity="error">{errors.geometry}</Alert>}
                  {draft.geometry && <Typography color="text.secondary" variant="body2">
                    頂点 {draft.geometry.coordinates[0].length - 1} 点
                  </Typography>}
                  {draft.geometry && <Button onClick={() => changeDraft({ geometry: undefined })} disabled={locked}>
                    描画をやり直す
                  </Button>}
                  <Stack direction="row" spacing={1}>
                    <Button type="submit" variant="contained" disabled={locked}>{saving ? '保存中…' : '保存'}</Button>
                    <Button onClick={cancelDraft} disabled={saving || conflict?.status === 'loading'}>キャンセル</Button>
                  </Stack>
                </Stack>
              ) : detail.isPending ? (
                <CircularProgress size={20} aria-label="エリアの詳細を取得中" />
              ) : detail.isError ? (
                <Alert severity="error" action={<Button color="inherit" onClick={() => detail.refetch()}>再試行</Button>}>
                  {getApiError(detail.error).message}
                </Alert>
              ) : detail.data && (
                <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
                  <Typography component="h3" variant="subtitle1">{detail.data.area.name}</Typography>
                  <Typography variant="body2">担当者　{assigneeName(detail.data.area.assigneeId)}</Typography>
                  <Button variant="outlined" onClick={() => startDraft(editDraft(detail.data))}>編集</Button>
                </Stack>
              )}
              {notice && <Alert severity="success" sx={{ mt: 1 }}>{notice}</Alert>}
            </div>
          </Paper>
        )}
      </div>
    </main>
  );
}
