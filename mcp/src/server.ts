#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  configFromEnv,
  formatPaperFormat,
  publishPaper,
} from "./publish.js";

async function main(): Promise<void> {
  const server = new McpServer({ name: "paper-reader-mcp", version: "0.1.0" });

  server.registerTool(
    "paper_format",
    {
      title: "Get the Paper Reader publish format",
      description: "Returns the publish JSON Schema and a worked example.",
      inputSchema: {},
    },
    async () => {
      const text = formatPaperFormat();
      return {
        content: [{ type: "text", text }],
        isError: false,
      };
    },
  );

  server.registerTool(
    "publish_paper",
    {
      title: "Publish a BYOM paper",
      description:
        "Publishes an invented or model-extracted payload to Paper Reader and returns its ephemeral URL.",
      inputSchema: {
        arxivId: z.string(),
        title: z.string(),
        authors: z.array(z.string()),
        paragraphs: z.array(z.record(z.string(), z.unknown())),
        figures: z.array(z.record(z.string(), z.unknown())),
        paraFigureMap: z
          .record(z.string(), z.array(z.string()))
          .optional(),
        client: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (args) => {
      try {
        const config = configFromEnv();
        const payload: Record<string, unknown> = { ...(args as object) };
        const result = await publishPaper(config, payload);
        const text = `${result.url} (expires ${result.expiresAt}${
          result.deduped ? "; deduped" : ""
        })`;
        return {
          content: [{ type: "text", text }],
          isError: false,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Publish failed";
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

await main();
