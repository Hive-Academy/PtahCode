import 'reflect-metadata';
import { MESSAGE_TYPES } from '@ptah-extension/shared';
import { WebviewMessageHandlerService } from './webview-message-handler.service';

describe('WebviewMessageHandlerService permission replies', () => {
  const logger = {
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), trace: jest.fn(),
  };
  const resolveRequest = jest.fn();
  const handleResponse = jest.fn();
  const runtimeContainer = {
    isRegistered: jest.fn(() => true),
    resolve: jest.fn(() => ({ handleResponse })),
  };
  const handler = new WebviewMessageHandlerService(
    logger as never,
    {} as never,
    { resolveRequest },
    runtimeContainer as never,
  );
  const config = { webviewId: 'chat', webview: {} as never };

  beforeEach(() => jest.clearAllMocks());

  it('consumes an MCP card answer sent through the SDK message path', async () => {
    resolveRequest.mockReturnValueOnce(true);
    const response = { id: 'mcp-1', decision: 'allow' };
    await handler.handleMessage(config, { type: MESSAGE_TYPES.SDK_PERMISSION_RESPONSE, response });
    expect(resolveRequest).toHaveBeenCalledWith(response);
    expect(handleResponse).not.toHaveBeenCalled();
  });

  it('passes a non-MCP answer to the SDK handler', async () => {
    resolveRequest.mockReturnValueOnce(false);
    await handler.handleMessage(config, {
      type: MESSAGE_TYPES.SDK_PERMISSION_RESPONSE,
      response: { id: 'sdk-1', decision: 'deny' },
    });
    expect(handleResponse).toHaveBeenCalledWith('sdk-1', expect.objectContaining({ decision: 'deny' }));
  });
});
