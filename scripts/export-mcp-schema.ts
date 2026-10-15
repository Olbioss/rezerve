/**
 * Print the assistant's tools exactly as /api/mcp lists them — the contract
 * the rezerve-assistant repository keeps a copy of, and fails its tests against
 * when they drift.
 *
 *   bun run mcp:schema > ../rezerve-assistant/contract/rezerve-mcp-tools.json
 */
import { toolSchemaDocument } from "@/lib/assistant/tool-schema";

console.log(JSON.stringify(await toolSchemaDocument(), null, 2));
