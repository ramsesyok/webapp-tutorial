import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography, type TextFieldProps } from '@mui/material';
import { Controller, useFormState } from 'react-hook-form';
import { getApiError } from './api/errors';
import { categories, categoryLabels, type PlaceDraft, type PlaceForm, type PlaceInput } from './places';

type PlaceFieldProps = Pick<
  TextFieldProps, 'label' | 'select' | 'children' | 'required' | 'autoFocus' | 'disabled' | 'multiline' | 'minRows' | 'slotProps'
> & {
  name: keyof PlaceDraft;
  form: PlaceForm;
};

function PlaceField({ name, form, ...props }: PlaceFieldProps) {
  return (
    <Controller name={name} control={form.control} render={({ field: { ref, ...field }, fieldState }) => (
      <TextField {...props} {...field} inputRef={ref} fullWidth
        onChange={(event) => {
          field.onChange(event);
          if (fieldState.error) form.clearErrors(name);
        }}
        error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />
    )} />
  );
}

type Props = {
  mode: 'create' | 'edit';
  form: PlaceForm;
  onClose: () => void;
  onSave: (input: PlaceInput) => Promise<void>;
};

export function PlaceEditor({ mode, form, onClose, onSave }: Props) {
  const { errors, isSubmitting } = useFormState({ control: form.control });
  const submit = form.handleSubmit(async (input) => {
    try {
      await onSave(input);
    } catch (error) {
      const { fieldErrors, message } = getApiError(error);
      const entries = Object.entries(fieldErrors);
      for (const [name, reason] of entries) {
        form.setError(name as keyof PlaceDraft, { type: 'server', message: reason });
      }
      if (entries.length === 0) form.setError('root.server', { type: 'server', message });
    }
  });

  return (
    <Paper component="section" variant="outlined" aria-labelledby="editor-title">
      <Stack component="form" onSubmit={submit} noValidate spacing={2} sx={{ p: 2 }}>
        <Typography id="editor-title" variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          {mode === 'edit' ? '拠点を編集' : '拠点を登録'}
        </Typography>
        <Typography variant="body2" color="text.secondary">黄色いピンをドラッグするか、座標欄に入力して位置を指定できます。</Typography>
        {errors.root?.server?.message && <Alert severity="error">{errors.root.server.message}</Alert>}
        <PlaceField form={form} name="name" label="名前" required autoFocus disabled={isSubmitting} />
        <PlaceField form={form} name="category" label="カテゴリ" select disabled={isSubmitting}>
          {categories.map((category) => <MenuItem key={category} value={category}>{categoryLabels[category]}</MenuItem>)}
        </PlaceField>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <PlaceField form={form} name="longitude" label="経度" required disabled={isSubmitting}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
          <PlaceField form={form} name="latitude" label="緯度" required disabled={isSubmitting}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
        </Stack>
        <PlaceField form={form} name="memo" label="メモ" multiline minRows={3} disabled={isSubmitting} />
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          <Button type="button" onClick={onClose} disabled={isSubmitting}>キャンセル</Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>{isSubmitting ? '保存中…' : '保存'}</Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
