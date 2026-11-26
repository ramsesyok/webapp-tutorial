import { z } from 'zod';

const categorySchema = z.enum(['sightseeing', 'nature', 'food']);
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

const latitudeLimit = 85.051129;
export const placeInputSchema = z.object({
  name: z.string().trim().min(1, '名前を入力してください').max(80, '80文字以内で入力してください'),
  category: categorySchema,
  longitude: z.number({ error: '経度を数値で入力してください' }).min(-180, '経度は −180〜180 の範囲です').max(180, '経度は −180〜180 の範囲です'),
  latitude: z.number({ error: '緯度を数値で入力してください' }).min(-latitudeLimit, '緯度は −85.051129〜85.051129 の範囲です').max(latitudeLimit, '緯度は −85.051129〜85.051129 の範囲です'),
  memo: z.string().max(500, '500文字以内で入力してください'),
});

export type PlaceInput = z.infer<typeof placeInputSchema>;
export type Place = PlaceInput & { id: number };
export type PlaceSummary = Omit<Place, 'memo'>;
export type SearchFilters = { q?: string; category?: Category };
export type Coordinates = Pick<PlaceInput, 'longitude' | 'latitude'>;

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

export function errorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    // OrvalはHTTPエラーの本文をinfoに格納し、Hey APIの生成オプションは本文をthrowする。
    const body = 'info' in error ? error.info : error;
    if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
      return body.message;
    }
    if (error instanceof Error) return error.message;
  }
  return 'サーバーに接続できませんでした。';
}
