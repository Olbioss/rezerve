/**
 * Print the assistant tools' JSON Schemas — the contract the rezerve-asistan
 * repository keeps a copy of, and fails its tests against when they drift.
 *
 *   bun run mcp:schema > ../rezerve-asistan/contract/rezerve-mcp-tools.json
 */
import { toolSchemaDocument } from "@/lib/assistant/tool-schema";

console.log(JSON.stringify(toolSchemaDocument(), null, 2));
