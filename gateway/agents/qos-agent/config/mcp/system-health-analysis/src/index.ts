import process from 'node:process'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { tools, dispatch } from './handlers.js'

const _origWrite = process.stdout.write.bind(process.stdout)
process.stdout.write = function (chunk: any, ...rest: any[]): any {
  if (typeof chunk === 'string') {
    const escaped = chunk.replace(/[\u007f-\uffff]/g, c => '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4))
    return _origWrite(escaped, ...rest)
  }
  return _origWrite(chunk, ...rest)
} as any

const server = new Server(
  { name: 'system-health-analysis', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const result = await dispatch(name, (args ?? {}) as Record<string, unknown>)
  return { content: [{ type: 'text', text: result }] }
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[system-health-analysis] MCP server running on stdio')
