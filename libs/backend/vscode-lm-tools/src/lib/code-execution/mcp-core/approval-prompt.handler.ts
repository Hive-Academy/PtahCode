/**
 * Approval Prompt Handler
 *
 * Handles the approval_prompt MCP tool for requesting user permission
 * via the VS Code webview UI.
 */

import type { Logger, WebviewManager } from '@ptah-extension/vscode-core';
import { MESSAGE_TYPES, TabId, type PermissionResponse } from '@ptah-extension/shared';
import type { PermissionPromptService } from '../../permission/permission-prompt.service';
import type { MCPRequest, MCPResponse, ApprovalPromptParams } from '../types';

/**
 * Dependencies for approval prompt handling.
 *
 * webviewManager is optional: present in VS Code for user approval prompts,
 * absent in Electron where the caller (protocol-handlers.ts) auto-allows
 * before reaching this handler.
 */
export interface ApprovalPromptDependencies {
  permissionPromptService: PermissionPromptService;
  webviewManager?: WebviewManager;
  logger: Logger;
}

/**
 * Handle approval_prompt MCP tool call
 *
 * Flow:
 * 1. Create permission request
 * 2. Send to webview for user interaction
 * 3. Wait for response via Promise-based resolver
 * 4. Format MCP response per Claude CLI expectations
 */
export async function handleApprovalPrompt(
  request: MCPRequest,
  params: ApprovalPromptParams,
  deps: ApprovalPromptDependencies,
): Promise<MCPResponse> {
  const { permissionPromptService, webviewManager, logger } = deps;

  logger.debug('Handling approval_prompt', { params });
  if (!webviewManager) {
    logger.info('approval_prompt auto-allowed (no WebviewManager)', {
      tool: params.tool_name,
    });
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              behavior: 'allow',
              updatedInput: params.input,
            }),
          },
        ],
      },
    };
  }
  // A card needs a verified owner. The HTTP transport stamps
  // `_callerSessionId` from the URL and `_callerBinding` from the credential;
  // a request body cannot set either. Producer coverage (intentional):
  //
  // | Producer (binding kind)                     | Result                  |
  // | ------------------------------------------- | ----------------------- |
  // | Claude interactive chat (`session`, UUID)   | Card on the owner tab   |
  // | Codex chat (`session`, UUID tab id)         | Card on the owner tab   |
  // | CLI lane (`agent`)                          | Deny, no card (1)       |
  // | External client (`workspace` / `home`)      | Deny, no card (2)       |
  // | Internal query (`internal-query`)           | Deny, no card (3)       |
  // | In-process / stdio (no binding)             | Deny, no card (2)       |
  // | Session URL that differs from the token     | Deny, no card           |
  //
  // (1) Lane approvals use the agent monitor surface (Copilot bridge, SDK
  //     lane route), not this tool. (2) No Ptah chat tab owns the call, so
  //     no surface can verify who answers it. (3) Internal queries do not
  //     prompt a user. Each denial is immediate, so the caller never waits
  //     for the deadline.
  const ownerId = request._callerSessionId?.trim();
  if (!ownerId || !TabId.safeParse(ownerId) ||
      request._callerBinding?.kind !== 'session' ||
      request._callerBinding.sessionId !== ownerId) {
    logger.info('approval_prompt denied: no verified session owner', {
      tool: params.tool_name,
      bindingKind: request._callerBinding?.kind ?? 'none',
    });
    return formatApprovalResponse(request, params, {
      id: '', decision: 'deny', reason: 'Permission request has no verified session owner',
    }, logger);
  }
  const permissionRequest = permissionPromptService.createRequest(params, ownerId);
  const responsePromise = new Promise<PermissionResponse>((resolve) => {
    permissionPromptService.setPendingResolver(
      permissionRequest.id,
      (response) => {
        resolve(response);
      },
      permissionRequest,
    );
  });
  try {
    const delivered = await webviewManager.sendMessage(
      'ptah.main', MESSAGE_TYPES.PERMISSION_REQUEST, permissionRequest,
    );
    if (delivered === false) {
      permissionPromptService.resolveRequest({
        id: permissionRequest.id, decision: 'deny', reason: 'Permission window unavailable',
      });
    }
  } catch {
    permissionPromptService.resolveRequest({
      id: permissionRequest.id, decision: 'deny', reason: 'Permission window unavailable',
    });
  }
  const response = await responsePromise;
  return formatApprovalResponse(request, params, response, logger);
}

/**
 * Format the MCP response based on user's permission decision
 */
function formatApprovalResponse(
  request: MCPRequest,
  params: ApprovalPromptParams,
  response: PermissionResponse,
  logger: Logger,
): MCPResponse {
  if (response.decision === 'allow' || response.decision === 'always_allow') {
    logger.info('Permission granted', {
      id: response.id,
      decision: response.decision,
    });

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              behavior: 'allow',
              updatedInput: params.input,
            }),
          },
        ],
      },
    };
  } else {
    logger.info('Permission denied', {
      id: response.id,
      reason: response.reason,
    });

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              behavior: 'deny',
              message: response.reason || 'User denied permission',
            }),
          },
        ],
      },
    };
  }
}
