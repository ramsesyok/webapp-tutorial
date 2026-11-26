import { useState, type FormEvent } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material';
import { categories, categoryLabels, errorMessage, placeInputSchema, type Coordinates, type Place, type PlaceInput } from './places';

export type Editor = { mode: 'create'; coordinates?: Coordinates } | { mode: 'edit'; place: Place };

type Props = {
  editor: Editor;
  onClose: () => void;
  onSave: (input: PlaceInput) => Promise<void>;
};

export function PlaceEditor({ editor, onClose, onSave }: Props) {
  const place = editor.mode === 'edit' ? editor.place : undefined;
  const coordinates = editor.mode === 'create' ? editor.coordinates : place;
  const [fields, setFields] = useState({
    name: place?.name ?? '',
    category: place?.category ?? 'sightseeing',
    longitude: coordinates?.longitude.toString() ?? '',
    latitude: coordinates?.latitude.toString() ?? '',
    memo: place?.memo ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof PlaceInput, string>>>({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);

  function change<K extends keyof typeof fields>(name: K, value: (typeof fields)[K]) {
    setFields((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setServerError('');
    // 入力中は文字列のまま保持し、送信前にAPIへ渡す数値へ変換する。
    const result = placeInputSchema.safeParse({
      ...fields,
      longitude: fields.longitude.trim() === '' ? NaN : Number(fields.longitude),
      latitude: fields.latitude.trim() === '' ? NaN : Number(fields.latitude),
    });
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      setErrors({
        name: fieldErrors.name?.[0],
        category: fieldErrors.category?.[0],
        longitude: fieldErrors.longitude?.[0],
        latitude: fieldErrors.latitude?.[0],
        memo: fieldErrors.memo?.[0],
      });
      return;
    }
    setSaving(true);
    try {
      await onSave(result.data);
    } catch (error) {
      // レベル0の400応答はエラー全体のmessageを返す。
      setServerError(errorMessage(error));
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="editor-title">
      <form onSubmit={submit} noValidate>
        <DialogTitle id="editor-title">{place ? '場所を編集' : '場所を登録'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {serverError && <Alert severity="error">{serverError}</Alert>}
            <TextField label="名前" value={fields.name} onChange={(e) => change('name', e.target.value)}
              error={Boolean(errors.name)} helperText={errors.name} required fullWidth autoFocus disabled={saving} />
            <TextField label="カテゴリ" name="category" select value={fields.category}
              onChange={(e) => change('category', e.target.value as PlaceInput['category'])}
              error={Boolean(errors.category)} helperText={errors.category} fullWidth disabled={saving}>
              {categories.map((category) => <MenuItem key={category} value={category}>{categoryLabels[category]}</MenuItem>)}
            </TextField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="経度" value={fields.longitude} onChange={(e) => change('longitude', e.target.value)}
                error={Boolean(errors.longitude)} helperText={errors.longitude} fullWidth required disabled={saving}
                slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
              <TextField label="緯度" value={fields.latitude} onChange={(e) => change('latitude', e.target.value)}
                error={Boolean(errors.latitude)} helperText={errors.latitude} fullWidth required disabled={saving}
                slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
            </Stack>
            <TextField label="メモ" value={fields.memo} onChange={(e) => change('memo', e.target.value)}
              error={Boolean(errors.memo)} helperText={errors.memo} fullWidth multiline minRows={3} disabled={saving} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button type="submit" variant="contained" disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
