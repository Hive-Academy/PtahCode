---
name: webhook-architecture
description: "Three-layer NestJS inbound webhooks. Use for endpoints, signature checks, event routing, idempotency, or delivery recovery."
---

# 3-Layer Webhook Architecture

## Apply

- Implement each inbound provider webhook in its Stage B domain module. Keep HTTP extraction, verification/routing, and domain handling in separate layers.
- Preserve the raw request bytes for signature verification. Verify before parsing or dispatching an event.
- Deduplicate provider event IDs before applying domain mutations. Durably persist handler failures in the webhook service. Acknowledge with 200 only when an automatic retry path will redrive the stored failure; otherwise return a retryable response. Consult the recovery guide for manual-retry and queue options.
- Keep provider-specific event mapping in the webhook service; route each event type to one domain handler method, which owns its business changes.

## Load by task

- For controller, verification service, domain handler, and module wiring, load [three-layer pattern](references/three-layer-pattern.md).
- For SDK verification or HMAC, timestamp, and raw body requirements, load [signature verification](references/signature-verification.md).
- For idempotency, failed delivery storage, response handling, and retry queues, load [resilience and recovery](references/resilience-and-recovery.md).
