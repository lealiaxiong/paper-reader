# paper-reader-mcp

Local stdio [Model Context Protocol](https://modelcontextprotocol.io/) server for Paper Reader BYOM publishing.

## Tools

- `paper_format`: returns the publish JSON Schema and a worked example.
- `publish_paper`: posts a payload to `POST /api/publish` and returns the ephemeral reader URL.

## Environment

- `PAPER_READER_URL`: base URL, for example `https://paper-reader-omega.vercel.app` or `http://localhost:3000` for local development.
- `PAPER_READER_TOKEN`: a publisher bearer token accepted by `PUBLISH_TOKENS` on the server.

`PAPER_READER_URL` is the Paper Reader site origin (the same URL you open in a browser), not the paper URL; the MCP server posts to `${PAPER_READER_URL}/api/publish`.

## Build

```sh
npm --prefix mcp install
npm --prefix mcp run build
```

```json
{
  "mcp": {
    "paper-reader": {
      "type": "local",
      "command": ["node", "/absolute/path/to/paper-reader/mcp/dist/server.js"],
      "environment": {
        "PAPER_READER_URL": "https://paper-reader-omega.vercel.app",
        "PAPER_READER_TOKEN": "{env:PAPER_READER_TOKEN}"
      }
    }
  }
}
```

For local development, use `http://localhost:3000` and set `PUBLISH_TOKENS` on the local server.
