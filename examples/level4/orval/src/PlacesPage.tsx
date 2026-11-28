import AddRounded from '@mui/icons-material/AddRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  Alert, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, IconButton, List, ListItemButton, ListItemText, MenuItem, Paper, Stack, TextField,
  Typography,
} from '@mui/material';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import { getApiError } from './api/errors';
import type { User } from './api/use-management';
import { usePlace, usePlaceMutations, usePlaces } from './api/use-places';
import { useMapStore } from './map-store';
import { AssigneeForm, AssignmentHistory } from './PlaceAssignment';
import { PlaceEditor } from './PlaceEditor';
import { PlaceMap } from './PlaceMap';
import {
  categories, categoryColors, categoryLabels, coordinateFields, getSearchFilters, getSelectedId,
  placeDraft, resolvePlaceDraft,
  type Category, type Coordinates, type Place, type PlaceDraft, type PlaceInput, type PlaceSummary, type SearchFilters,
} from './places';

const emptyPlaces: PlaceSummary[] = [];
type Editor = { mode: 'create' } | { mode: 'edit'; placeId: number };

type SearchProps = {
  filters: SearchFilters;
  onApply: (filters: SearchFilters) => void;
};

function SearchForm({ filters, onApply }: SearchProps) {
  const [q, setQ] = useState(filters.q ?? '');
  const [category, setCategory] = useState<Category | ''>(filters.category ?? '');
  function submit(event: FormEvent) {
    event.preventDefault();
    onApply({ q: q.trim() || undefined, category: category || undefined });
  }
  return (
    <form className="search-form" onSubmit={submit}>
      <TextField label="キーワード" value={q} onChange={(e) => setQ(e.target.value)} size="small"
        placeholder="名前やメモで探す" slotProps={{ htmlInput: { maxLength: 100 } }} fullWidth />
      <div className="search-actions">
        <TextField label="カテゴリ" select value={category} size="small" fullWidth
          onChange={(e) => setCategory(e.target.value as Category | '')}>
          <MenuItem value="">すべて</MenuItem>
          {categories.map((item) => <MenuItem key={item} value={item}>{categoryLabels[item]}</MenuItem>)}
        </TextField>
        <Button type="submit" variant="contained" startIcon={<SearchRounded />} sx={{ flexShrink: 0 }}>検索</Button>
        <Button type="button" sx={{ flexShrink: 0 }} onClick={() => {
          setQ('');
          setCategory('');
          onApply({});
        }}>クリア</Button>
      </div>
    </form>
  );
}

export function PlacesPage({ user }: { user: User }) {
  const isAdmin = user.role === 'admin';
  const [params, setParams] = useSearchParams();
  const filters = getSearchFilters(params);
  const selectedId = getSelectedId(params);
  const list = usePlaces(filters);
  const detail = usePlace(selectedId);
  const mutations = usePlaceMutations();
  const places = list.isSuccess ? list.data : emptyPlaces;
  const selectedPlace = places.find((item) => item.id === selectedId) ?? (detail.isSuccess ? detail.data : undefined);
  const picking = useMapStore((state) => state.picking);
  const setPicking = useMapStore((state) => state.setPicking);
  const [editor, setEditor] = useState<Editor>();
  const [toDelete, setToDelete] = useState<Place>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [notice, setNotice] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const isOpen = useRef(false);
  useEffect(() => {
    isOpen.current = true;
    return () => { isOpen.current = false; };
  }, []);

  const form = useForm<PlaceDraft, Editor['mode'], PlaceInput>({
    defaultValues: placeDraft(),
    resolver: resolvePlaceDraft,
    context: editor?.mode ?? 'create',
    reValidateMode: 'onSubmit',
  });

  function openEditor(place?: Place, coordinates?: Coordinates) {
    form.reset(placeDraft(place, coordinates));
    setPicking(false);
    setNotice('');
    setEditor(place ? { mode: 'edit', placeId: place.id } : { mode: 'create' });
  }

  function cancelEditor() {
    form.reset();
    setEditor(undefined);
  }

  function updateCoordinates(coordinates: Coordinates) {
    const { longitude, latitude } = coordinateFields(coordinates);
    form.setValue('longitude', longitude, { shouldDirty: true });
    form.setValue('latitude', latitude, { shouldDirty: true });
    form.clearErrors(['longitude', 'latitude']);
  }

  // 書き込むのは共有URLだけ。再読み込みと履歴移動も同じ画面状態から復元する。
  function select(id: number | undefined) {
    const next = new URLSearchParams(params);
    if (id === undefined) next.delete('place');
    else next.set('place', String(id));
    if (next.toString() !== params.toString()) setParams(next);
    setShareUrl('');
  }

  function applySearch(nextFilters: SearchFilters) {
    const next = new URLSearchParams(params);
    next.delete('q');
    next.delete('category');
    if (nextFilters.q) next.set('q', nextFilters.q);
    if (nextFilters.category) next.set('category', nextFilters.category);
    if (next.toString() !== params.toString()) setParams(next);
    setShareUrl('');
  }

  const outsideResult = selectedId !== undefined && !places.some((item) => item.id === selectedId);
  useEffect(() => {
    if (!list.isSuccess || list.isFetching || !detail.isSuccess || !outsideResult) return;
    const next = new URLSearchParams(params);
    next.delete('place');
    setParams(next, { replace: true });
  }, [detail.isSuccess, list.isFetching, list.isSuccess, outsideResult, params, setParams]);

  async function save(input: PlaceInput) {
    if (!editor) return;
    if (editor.mode === 'create') {
      const place = await mutations.create(input);
      // ログアウト後に更新結果が届いても、共有URLを書き換えない。
      if (!isOpen.current) return;
      select(place.id);
      setNotice('場所を登録しました。');
    } else {
      await mutations.update(editor.placeId, input);
      setNotice('場所を更新しました。');
    }
    setEditor(undefined);
  }

  async function remove() {
    if (deleting || !toDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await mutations.remove(toDelete.id);
      if (!isOpen.current) return;
      select(undefined);
      setToDelete(undefined);
      setNotice('場所を削除しました。');
    } catch (error) {
      setDeleteError(getApiError(error).message);
    } finally {
      setDeleting(false);
    }
  }

  async function copyLink() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setNotice('場所のURLをコピーしました。');
    } catch {
      setShareUrl(url);
    }
  }

  const categoryCounts = { sightseeing: 0, nature: 0, food: 0 };
  for (const place of places) categoryCounts[place.category] += 1;

  return (
    <>
      <main className="workspace">
        <Paper component="section" variant="outlined" className="map-panel" aria-labelledby="map-title">
          <div className="panel-heading map-heading">
            <div>
              <Typography id="map-title" variant="h6" component="h2" sx={{ fontWeight: 700 }}>世界地図</Typography>
              {!editor && <Typography variant="body2" color="text.secondary">ピンを選ぶと詳細を表示します</Typography>}
            </div>
            {isAdmin && <Button variant="contained" startIcon={<AddRounded />} onClick={() => {
              setPicking(true);
              setNotice('');
            }} disabled={picking || Boolean(editor)}>場所を追加</Button>}
          </div>
          {picking && (
            <Alert severity="info" className="picking-alert" action={
              <Button color="inherit" size="small" onClick={() => setPicking(false)}>キャンセル</Button>
            }>地図をクリックして登録位置を決めてください。<Button size="small" onClick={() => openEditor()}>座標を入力</Button></Alert>
          )}
          <PlaceMap places={places} selectedId={selectedId} selectedPlace={selectedPlace}
            control={form.control} editing={Boolean(editor)}
            editingPlaceId={editor?.mode === 'edit' ? editor.placeId : undefined}
            onSelect={(id) => { if (!editor) select(id); }}
            onPick={(coordinates) => openEditor(undefined, coordinates)}
            onDrag={updateCoordinates} />
          <div className="map-footer">
            {categories.map((category) => <span key={category}>
              <span className="category-dot" style={{ backgroundColor: categoryColors[category] }} />
              {categoryLabels[category]}
            </span>)}
            <span className="map-credit">Rendered with MapTiler Desktop</span>
          </div>
        </Paper>

        <div className="side-panel">
          {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
          {editor && <PlaceEditor mode={editor.mode} form={form}
            onClose={cancelEditor} onSave={save} />}
          <Paper component="section" variant="outlined" aria-labelledby="list-title" hidden={Boolean(editor)}>
            <div className="panel-heading side-heading">
              <Typography id="list-title" variant="h6" component="h2" sx={{ fontWeight: 700 }}>{isAdmin ? '場所を探す' : '自分の担当拠点'}</Typography>
              {list.isSuccess && <Chip label={`${places.length} 件`} size="small" />}
            </div>
            <SearchForm key={JSON.stringify(filters)} filters={filters} onApply={applySearch} />
            {list.isPending && <div className="list-message"><CircularProgress size={24} aria-label="場所を取得中" /></div>}
            {list.isError && <div className="list-message">
              <Alert severity="error" action={<Button color="inherit" onClick={() => list.refetch()}>再試行</Button>}>
                {getApiError(list.error).message}
              </Alert>
            </div>}
            {list.isSuccess && places.length === 0 && <Typography className="list-message" color="text.secondary">
              条件に一致する場所がありません。
            </Typography>}
            {list.isSuccess && places.length > 0 && (
              <List className="place-list" disablePadding>
                {places.map((place) => (
                  <ListItemButton key={place.id} selected={place.id === selectedId} onClick={() => select(place.id)}>
                    <PlaceOutlined sx={{ mr: 1, color: categoryColors[place.category] }} />
                    <ListItemText primary={place.name} />
                    <Chip label={categoryLabels[place.category]} size="small" variant="outlined" />
                  </ListItemButton>
                ))}
              </List>
            )}
            {list.isSuccess && <div className="list-footer">
              {categories.map((category) => (
                <span key={category}>{categoryLabels[category]} <strong>{categoryCounts[category]}</strong></span>
              ))}
            </div>}
          </Paper>
          <Paper component="section" variant="outlined" aria-labelledby="detail-title" hidden={Boolean(editor)}>
            <div className="panel-heading side-heading">
              <Typography id="detail-title" variant="h6" component="h2" sx={{ fontWeight: 700 }}>場所の詳細</Typography>
              {selectedId !== undefined && <IconButton aria-label="詳細を閉じる" onClick={() => select(undefined)} size="small"><CloseRounded /></IconButton>}
            </div>
            <div className="detail-content">
              {selectedId === undefined && <Typography color="text.secondary" variant="body2">地図または一覧から場所を選んでください。</Typography>}
              {selectedId !== undefined && detail.isPending && <CircularProgress size={24} aria-label="詳細を取得中" />}
              {selectedId !== undefined && detail.isError && <Alert severity="error">{getApiError(detail.error).message}</Alert>}
              {selectedId !== undefined && detail.isSuccess && (
                <Stack spacing={1.5}>
                  <Typography variant="h6" component="h3" sx={{ fontWeight: 650 }}>{detail.data.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {categoryLabels[detail.data.category]} ・ {detail.data.latitude.toFixed(4)}, {detail.data.longitude.toFixed(4)}
                  </Typography>
                  <Typography className="place-memo" variant="body2">{detail.data.memo || 'メモはありません。'}</Typography>
                  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                    <Button size="small" variant="outlined" onClick={() => openEditor(detail.data)}>編集</Button>
                    {isAdmin && <Button size="small" color="error" onClick={() => { setDeleteError(''); setToDelete(detail.data); }}>削除</Button>}
                    <Button size="small" startIcon={<ContentCopyRounded />} onClick={copyLink}>URLをコピー</Button>
                  </Stack>
                  {shareUrl && <TextField label="共有URL" size="small" value={shareUrl} onFocus={(e) => e.target.select()}
                    slotProps={{ input: { readOnly: true } }} />}
                  {isAdmin ? (
                    <AssigneeForm key={`${detail.data.id}:${detail.data.assigneeId}`} place={detail.data} />
                  ) : (
                    <Typography variant="body2">担当者 {user.loginId}</Typography>
                  )}
                  <AssignmentHistory placeId={detail.data.id} />
                </Stack>
              )}
            </div>
          </Paper>
        </div>
      </main>

      {toDelete && (
        <Dialog open onClose={deleting ? undefined : () => setToDelete(undefined)} aria-labelledby="delete-title">
          <DialogTitle id="delete-title">場所を削除</DialogTitle>
          <DialogContent>
            <DialogContentText>「{toDelete.name}」を削除しますか？</DialogContentText>
            {deleteError && <Alert sx={{ mt: 2 }} severity="error">{deleteError}</Alert>}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setToDelete(undefined)} disabled={deleting}>キャンセル</Button>
            <Button onClick={remove} color="error" variant="contained" disabled={deleting}>
              {deleting ? '削除中…' : '削除する'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
