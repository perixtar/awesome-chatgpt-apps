# MCP Server Tests

This directory contains generic tests for the MCP server that validate both stdio and HTTP transports work correctly.

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with interactive UI
npm run test:ui
```

## What Gets Tested

The test suite validates core MCP functionality that should work for any server built from this boilerplate:

### Stdio Transport Tests

- Server initialization via stdio
- Tool listing
- Resource listing
- Tool execution
- Ping/pong communication

### HTTP Transport Tests

- Health check endpoint
- MCP initialization with session management
- Tool listing via HTTP
- Tool execution via HTTP
- Session ID validation
- Error handling for requests without session IDs

## Adding Custom Tests

When you add new tools or resources to your MCP server, consider adding specific tests:

```typescript
it("should handle my custom tool", async () => {
  const result = await client.callTool({
    name: "my_custom_tool",
    arguments: { param1: "value1" },
  });

  expect(result.content).toBeDefined();
  // Add assertions specific to your tool's behavior
});
```

## Test Structure

- `mcp-server.test.ts` - Main test file with generic tests for all MCP servers
- Tests use Vitest as the test framework
- Tests spawn the server as a subprocess to test real-world scenarios

## Why These Tests Matter

These generic tests ensure:

1. **Transport Compatibility**: Both stdio and HTTP modes work correctly
2. **Protocol Compliance**: Server follows MCP protocol correctly
3. **Session Management**: HTTP sessions are handled properly
4. **Error Handling**: Server responds appropriately to invalid requests
5. **Future-Proofing**: As you add features, these tests catch breaking changes

## Continuous Integration

Consider running these tests in CI/CD pipelines to ensure code changes don't break core MCP functionality.
