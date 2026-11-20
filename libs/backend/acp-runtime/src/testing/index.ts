/**
 * Test-only entry (`@ptah-extension/acp-runtime/testing`): the scripted fake
 * ACP agent and its in-memory transport, for specs in this library and in
 * the lanes that run on it. Never imported by production code.
 */
export {
  createFakeAcpAgent,
  createFakeAcpTransport,
} from '../lib/__fixtures__/fake-acp-agent';
export type {
  FakeAcpAgent,
  FakeAcpAgentOptions,
  FakeAcpError,
  FakeAcpHandler,
  FakeAcpMessage,
  FakeAcpReply,
  FakeAcpTransport,
} from '../lib/__fixtures__/fake-acp-agent';
export {
  readAcpFixture,
  recordedResult,
  recordedUpdatesDuring,
} from '../lib/__fixtures__/acp-fixture-reader';
export type { AcpFixtureEnvelope } from '../lib/__fixtures__/acp-fixture-reader';
