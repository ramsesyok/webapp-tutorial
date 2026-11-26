import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { getApiError } from './api/use-places';
import {
  categories, categoryLabels, coordinateInput, validatePlaceInput,
  type CoordinateFields, type FieldErrors, type Place, type PlaceInput,
} from './places';

export type Editor = ({ mode: 'create' } | { mode: 'edit'; place: Place }) & { coordinates: CoordinateFields };

type Props = {
  editor: Editor;
  saving: boolean;
  onCoordinatesChange: (coordinates: CoordinateFields) => void;
  onClose: () => void;
  onSave: (input: PlaceInput) => Promise<void>;
};

export function PlaceEditor({ editor, saving, onCoordinatesChange, onClose, onSave }: Props) {
  const place = editor.mode === 'edit' ? editor.place : undefined;
  const { longitude, latitude } = editor.coordinates;
  const [fields, setFields] = useState({
    name: place?.name ?? '',
    category: place?.category ?? 'sightseeing',
    memo: place?.memo ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState('');

  // ドラッグでも座標欄が変わるので、値が変わった欄のエラーを外す。
  useEffect(() => {
    setErrors((current) => current.longitude ? { ...current, longitude: undefined } : current);
  }, [longitude]);
  useEffect(() => {
    setErrors((current) => current.latitude ? { ...current, latitude: undefined } : current);
  }, [latitude]);

  function change<K extends keyof typeof fields>(name: K, value: (typeof fields)[K]) {
    setFields((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setServerError('');
    // 入力中は文字列のまま保持し、送信前にAPIへ渡す数値へ変換する。
    const result = validatePlaceInput({
      ...fields,
      ...coordinateInput(editor.coordinates),
    }, editor.mode);
    if (!result.success) {
      const fieldError = (field: keyof PlaceInput) => result.issues.find((issue) => issue.path[0] === field)?.message;
      setErrors({
        name: fieldError('name'),
        category: fieldError('category'),
        longitude: fieldError('longitude'),
        latitude: fieldError('latitude'),
        memo: fieldError('memo'),
      });
      return;
    }
    setErrors({});
    try {
      await onSave(result.data);
    } catch (error) {
      const { fieldErrors, message } = getApiError(error);
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) setServerError(message);
    }
  }

  return (
    <Paper component="section" variant="outlined" aria-labelledby="editor-title">
      <Stack component="form" onSubmit={submit} noValidate spacing={2} sx={{ p: 2 }}>
        <Typography id="editor-title" variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          {place ? '拠点を編集' : '拠点を登録'}
        </Typography>
        <Typography variant="body2" color="text.secondary">黄色いピンをドラッグするか、座標欄に入力して位置を指定できます。</Typography>
        {serverError && <Alert severity="error">{serverError}</Alert>}
        <TextField label="名前" value={fields.name} onChange={(e) => change('name', e.target.value)}
          error={Boolean(errors.name)} helperText={errors.name} required fullWidth autoFocus disabled={saving} />
        <TextField label="カテゴリ" name="category" select value={fields.category}
          onChange={(e) => change('category', e.target.value as PlaceInput['category'])}
          error={Boolean(errors.category)} helperText={errors.category} fullWidth disabled={saving}>
          {categories.map((category) => <MenuItem key={category} value={category}>{categoryLabels[category]}</MenuItem>)}
        </TextField>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label="経度" value={longitude} onChange={(e) => onCoordinatesChange({ longitude: e.target.value, latitude })}
            error={Boolean(errors.longitude)} helperText={errors.longitude} fullWidth required disabled={saving}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
          <TextField label="緯度" value={latitude} onChange={(e) => onCoordinatesChange({ longitude, latitude: e.target.value })}
            error={Boolean(errors.latitude)} helperText={errors.latitude} fullWidth required disabled={saving}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
        </Stack>
        <TextField label="メモ" value={fields.memo} onChange={(e) => change('memo', e.target.value)}
          error={Boolean(errors.memo)} helperText={errors.memo} fullWidth multiline minRows={3} disabled={saving} />
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          <Button type="button" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button type="submit" variant="contained" disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
