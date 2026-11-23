import { AxiosError, type AxiosResponse } from 'axios';
import { ModelListError, classifyModelListFailure } from './model-list-error';

function axiosWithStatus(status: number): AxiosError {
  const response = {
    status,
    statusText: 'status',
    headers: {},
    config: {},
    data: { error: 'vendor text' },
  } as unknown as AxiosResponse;
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    response,
  );
}

function withCode(code: string): Error {
  return Object.assign(new Error(`raw ${code} text`), { code });
}

describe('classifyModelListFailure', () => {
  it('returns the reason a ModelListError carries', () => {
    expect(classifyModelListFailure(new ModelListError('bad-response'))).toBe(
      'bad-response',
    );
    expect(classifyModelListFailure(new ModelListError('empty'))).toBe('empty');
  });

  it.each([401, 403])('maps HTTP %d to auth-rejected', (status) => {
    expect(classifyModelListFailure(axiosWithStatus(status))).toBe(
      'auth-rejected',
    );
  });

  it.each([400, 404, 429, 500, 503])('maps HTTP %d to http-error', (status) => {
    expect(classifyModelListFailure(axiosWithStatus(status))).toBe(
      'http-error',
    );
  });

  it.each(['ECONNABORTED', 'ETIMEDOUT'])('maps %s to timeout', (code) => {
    expect(classifyModelListFailure(new AxiosError('timeout', code))).toBe(
      'timeout',
    );
    expect(classifyModelListFailure(withCode(code))).toBe('timeout');
  });

  it('maps a non-axios timeout error to timeout', () => {
    const error = new Error('The operation was aborted due to timeout');
    error.name = 'TimeoutError';
    expect(classifyModelListFailure(error)).toBe('timeout');
  });

  it.each([
    'ENOTFOUND',
    'ECONNREFUSED',
    'ECONNRESET',
    'EAI_AGAIN',
    'ENETUNREACH',
    'ERR_NETWORK',
  ])('maps %s to network', (code) => {
    expect(classifyModelListFailure(withCode(code))).toBe('network');
    expect(classifyModelListFailure(new AxiosError('network', code))).toBe(
      'network',
    );
  });

  it('maps an oversize axios body (no response) to bad-response', () => {
    expect(
      classifyModelListFailure(
        new AxiosError(
          'maxContentLength size of 2097152 exceeded',
          'ERR_BAD_RESPONSE',
        ),
      ),
    ).toBe('bad-response');
  });

  it.each([
    ['a plain error', new Error('boom')],
    ['an unknown code', withCode('EPERM')],
    ['a string', 'boom'],
    ['null', null],
    ['undefined', undefined],
    ['a non-string code', Object.assign(new Error('x'), { code: 42 })],
  ])('maps %s to unexpected', (_label, error) => {
    expect(classifyModelListFailure(error)).toBe('unexpected');
  });

  it('never carries raw error text in the ModelListError message', () => {
    const error = new ModelListError('network');
    expect(error.message).toBe('Model list unavailable: network');
    expect(error.name).toBe('ModelListError');
    expect(error).toBeInstanceOf(Error);
  });
});
