import { z } from 'zod';
import type { Place } from './api/generated/places';
import type { FieldErrors as FormErrors, Resolver, UseFormReturn } from 'react-hook-form';
import {
  Category as categorySchema, CreatePlaceBody, PlaceMapFields, UpdatePlaceBody,
} from './api/generated/validation';

export type Category = z.infer<typeof categorySchema>;
export const categories = categorySchema.options;
export const categoryLabels: Record<Category, string> = {
  sightseeing: '観光',
  nature: '自然',
  food: '食事',
};
export const categoryColors: Record<Category, string> = {
  sightseeing: '#176857',
  nature: '#576d2e',
  food: '#a34a32',
};

export const latitudeLimit = 85.051129;
export const coordinatesSchema = PlaceMapFields.pick({ longitude: true, latitude: true });

export type PlaceInput = z.infer<typeof CreatePlaceBody>;
export type { Place, PlaceSummary } from './api/generated/places';
export type SearchFilters = { q?: string; category?: Category };
export type Coordinates = z.infer<typeof coordinatesSchema>;
export type CoordinateFields = Record<keyof Coordinates, string>;
export type PlaceDraft = Omit<PlaceInput, keyof Coordinates> & CoordinateFields;
type EditorMode = 'create' | 'edit';
export type PlaceForm = UseFormReturn<PlaceDraft, EditorMode, PlaceInput>;

export function coordinateFields(coordinates?: Coordinates): CoordinateFields {
  return {
    longitude: coordinates?.longitude.toString() ?? '',
    latitude: coordinates?.latitude.toString() ?? '',
  };
}

export function placeDraft(place?: Place, coordinates?: Coordinates): PlaceDraft {
  return {
    name: place?.name ?? '',
    category: place?.category ?? 'sightseeing',
    ...coordinateFields(place ?? coordinates),
    memo: place?.memo ?? '',
  };
}

export function coordinateInput(fields: CoordinateFields): Coordinates {
  return {
    longitude: fields.longitude.trim() === '' ? NaN : Number(fields.longitude),
    latitude: fields.latitude.trim() === '' ? NaN : Number(fields.latitude),
  };
}

export function validatePlaceInput(input: PlaceInput, mode: EditorMode) {
  const schema = mode === 'create' ? CreatePlaceBody : UpdatePlaceBody;
  const result = schema.safeParse(input, { error: z.locales.ja().localeError });
  if (result.success) return result;

  // OpenAPIの文字数はコードポイント数。生成ZodのmaxはUTF-16の長さを数える。
  const issues = result.error.issues.filter((issue) => {
    const field = issue.path[0];
    if (issue.code === 'too_big' && issue.origin === 'string' && (field === 'name' || field === 'memo')) {
      return Array.from(input[field]).length > issue.maximum;
    }
    return true;
  });
  if (issues.length === 0) return { success: true as const, data: input };
  return { success: false as const, issues };
}

export const resolvePlaceDraft: Resolver<PlaceDraft, EditorMode, PlaceInput> = (draft, mode = 'create') => {
  // 入力途中の座標は文字列で持ち、送信前に数値へ変換して生成スキーマで検証する。
  const result = validatePlaceInput({ ...draft, ...coordinateInput(draft) }, mode);
  if (result.success) return { values: result.data, errors: {} };

  const errors: FormErrors<PlaceDraft> = {};
  for (const name of Object.keys(draft) as (keyof PlaceDraft)[]) {
    const issue = result.issues.find((issue) => issue.path[0] === name);
    if (issue) errors[name] = { type: issue.code, message: issue.message };
  }
  return { values: {}, errors };
};

const fieldErrorsResponse = z.object({
  fieldErrors: z.record(z.string(), z.string()),
});
export function parsePlaceError(body: unknown, cause: unknown = body) {
  const parsed = fieldErrorsResponse.safeParse(body);
  const fieldErrors = parsed.success ? parsed.data.fieldErrors : {};
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
    return { fieldErrors, message: body.message };
  }
  return {
    fieldErrors,
    message: cause instanceof Error ? cause.message : 'サーバーに接続できませんでした。',
  };
}

export function getSearchFilters(params: URLSearchParams): SearchFilters {
  const category = categorySchema.safeParse(params.get('category'));
  return {
    q: params.get('q')?.trim() || undefined,
    category: category.success ? category.data : undefined,
  };
}

export function getSelectedId(params: URLSearchParams) {
  const rawValue = params.get('place');
  if (!rawValue || !/^[1-9]\d*$/.test(rawValue)) return undefined;
  const id = Number(rawValue);
  return id <= 2147483647 ? id : undefined;
}
