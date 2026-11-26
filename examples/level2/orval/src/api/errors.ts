import { parsePlaceError } from '../places';

function getErrorBody(error: unknown) {
  // OrvalのFetchクライアントはHTTPエラー本文を Error.info に格納する。
  return error && typeof error === 'object' && 'info' in error ? error.info : error;
}

export function getApiError(error: unknown) {
  return parsePlaceError(getErrorBody(error), error);
}

export function isUnauthenticated(error: unknown) {
  const body = getErrorBody(error);
  return Boolean(body && typeof body === 'object' && 'code' in body && body.code === 'UNAUTHENTICATED');
}
