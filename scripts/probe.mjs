// Read-only diagnostic, usable from an OpenChamber agent shell. No generation or credential reads.
import { parseArgs } from 'node:util';
import { OpenCodeGateway } from '../shared/service/opencode.mjs';

const { values } = parseArgs({ options: {
  origin: { type: 'string' }, session: { type: 'string' }, directory: { type: 'string' },
} });
const origin = values.origin ?? (process.env.OPENCHAMBER_AGENT_TOOL_URL ? new URL(process.env.OPENCHAMBER_AGENT_TOOL_URL).origin : '');
const sessionId = values.session ?? process.env.OPENCODE_SESSION_ID;
const directory = values.directory ?? process.env.OPENCHAMBER_OPENCODE_CWD ?? process.cwd();
const connection = await new OpenCodeGateway().describe({ hostOrigin: origin, sessionId, directory });
console.log(JSON.stringify({
  endpoint: connection.endpoint, version: connection.version, directory: connection.directory,
  availableTextModels: connection.models.length,
  selectedModel: connection.models.find((entry) => entry.key === connection.selectedModelKey) ?? null,
  authentication: 'Existing local OpenChamber proxy; no upstream credentials read or inherited',
}, null, 2));
