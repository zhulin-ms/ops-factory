import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { dispatch, tools } from './handlers.js'
import { LOG_FILE_PATH, logError, logInfo } from './logger.js'

const server = new Server(
  { name: 'Knowledge-Cli', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => {
  logInfo('list_tools_requested', { toolCount: tools.length })
  return { tools }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    const result = await dispatch(name, args ?? {})
    return { content: [{ type: 'text', text: result }] }
  } catch (error) {
    logError('call_tool_failed', {
      tool: name,
      args: args ?? {},
      error,
    })
    throw error
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)

logInfo('server_started', {
  transport: 'stdio',
  pid: process.pid,
  rootDir: process.env.QA_CLI_ROOT_DIR || null,
  logFile: LOG_FILE_PATH,
})
