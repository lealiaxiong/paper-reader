# paper-reader-mcp

Local stdio [Model Context Protocol](https://modelcontextprotocol.io/) server for Paper Reader BYOM publishing.

## Tools

- `paper_format`: returns the publish JSON Schema and a worked example.
- `publish_paper`: posts a payload to `POST /api/publish` and returns the ephemeral reader URL.

## Environment

- `PAPER_READER_URL`: base URL, for example `https://paper-reader.example` or `http://localhost:3000`.
- `PAPER_READER_TOKEN`: a publisher bearer token accepted by `PUBLISH_TOKENS` on the server.

```json
{
  "mcp": {
    "paper-reader": {
      "type": "local",
      "command": ["npx", "-y", "paper-reader-mcp"],
      "environment": {
        "PAPER_READER_URL": "http://localhost:3000",
        "PAPER_READER_TOKEN": "{env:PAPER_READER_TOKEN}"
      }
    }
  }
}
```
