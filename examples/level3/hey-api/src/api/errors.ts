import { parsePlaceError } from '../places';

export function getApiError(error: unknown) {
  // Hey APIの生成オプションは throwOnError を設定し、HTTPエラー本文をそのまま渡す。
  return parsePlaceError(error);
}

export function isUnauthenticated(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'UNAUTHENTICATED');
}
