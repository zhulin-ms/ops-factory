const QOS_BASE_URL = (process.env.QOS_BASE_URL || 'https://192.168.161.163:38443').replace(/\/+$/, '')
const QOS_USERNAME = process.env.QOS_USERNAME || 'managementservice'
const QOS_PASSWORD = process.env.GATEWAY_API_PASSWORD || process.env.QOS_PASSWORD || ''

function normalizeTimestampMs(value: unknown, name: string): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`${name} must be a number (milliseconds since epoch)`)
  }

  const asInt = Math.trunc(value)
  if (asInt <= 0) {
    throw new Error(`${name} must be a positive timestamp`)
  }

  const normalized = asInt < 1_000_000_000_000 ? asInt * 1000 : asInt
  const now = Date.now()
  if (normalized > now + 10 * 60 * 1000) {
    throw new Error(`${name} looks like a future timestamp: ${normalized}`)
  }

  return normalized
}

function requireEnv(): void {
  if (!QOS_BASE_URL) throw new Error('QOS_BASE_URL is required')
  if (!QOS_USERNAME) throw new Error('QOS_USERNAME is required')
  if (!QOS_PASSWORD) throw new Error('GATEWAY_API_PASSWORD (or QOS_PASSWORD) is required')
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${QOS_USERNAME}:${QOS_PASSWORD}`).toString('base64')}`
}

async function qosPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  requireEnv()
  const url = new URL(`${QOS_BASE_URL}${path}`)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`QOS API ${path} returned ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export const tools = [
  {
    name: 'get_health_score',
    description: '查询指定时间范围的健康分数数据',
    inputSchema: {
      type: 'object' as const,
      properties: {
        envCode: { type: 'string', description: '环境编码' },
        startTime: { type: 'number', description: '开始时间（毫秒时间戳）' },
        endTime: { type: 'number', description: '结束时间（毫秒时间戳）' },
        mode: { type: 'string', description: '监控模式（默认 real）' },
      },
      required: ['envCode', 'startTime', 'endTime'],
    },
  },
  {
    name: 'get_abnormal_data',
    description: '查询指定时间范围的告警数据',
    inputSchema: {
      type: 'object' as const,
      properties: {
        envCode: { type: 'string', description: '环境编码' },
        startTime: { type: 'number', description: '开始时间（毫秒时间戳）' },
        endTime: { type: 'number', description: '结束时间（毫秒时间戳）' },
      },
      required: ['envCode', 'startTime', 'endTime'],
    },
  },
  {
    name: 'get_topography',
    description: '查询环境拓扑',
    inputSchema: {
      type: 'object' as const,
      properties: {
        envCode: { type: 'string', description: '环境编码' },
      },
      required: ['envCode'],
    },
  },
  {
    name: 'get_subtopography',
    description: '基于根因告警与相关告警查询子拓扑',
    inputSchema: {
      type: 'object' as const,
      properties: {
        envCode: { type: 'string', description: '环境编码' },
        rootAlarm: { type: 'object', description: '根因告警对象（JSON）' },
        relatedAlarms: { type: 'array', items: { type: 'object' }, description: '相关告警数组（JSON，可选）' },
      },
      required: ['envCode', 'rootAlarm'],
    },
  },
]

export async function dispatch(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'get_health_score': {
      const { envCode, startTime, endTime, mode } = args as {
        envCode?: string
        startTime?: number
        endTime?: number
        mode?: string
      }
      const startTimeMs = normalizeTimestampMs(startTime, 'startTime')
      const endTimeMs = normalizeTimestampMs(endTime, 'endTime')
      if (endTimeMs <= startTimeMs) {
        throw new Error(`endTime must be greater than startTime: startTime=${startTimeMs} endTime=${endTimeMs}`)
      }

      const body: Record<string, unknown> = {
        envCode: envCode ?? '',
        startTime: startTimeMs,
        endTime: endTimeMs,
      }
      if (mode && typeof mode === 'string') {
        body.mode = mode
      }

      const data = await qosPost('/itom/machine/qos/getDiagnoseHealthScore', body)
      return JSON.stringify(data, null, 2)
    }
    case 'get_abnormal_data': {
      const { envCode, startTime, endTime } = args as { envCode?: string; startTime?: number; endTime?: number }
      const startTimeMs = normalizeTimestampMs(startTime, 'startTime')
      const endTimeMs = normalizeTimestampMs(endTime, 'endTime')
      if (endTimeMs <= startTimeMs) {
        throw new Error(`endTime must be greater than startTime: startTime=${startTimeMs} endTime=${endTimeMs}`)
      }

      const data = await qosPost('/itom/machine/qos/getDiagnoseAbnormalData', {
        envCode: envCode ?? '',
        startTime: startTimeMs,
        endTime: endTimeMs,
      })
      return JSON.stringify(data, null, 2)
    }
    case 'get_topography': {
      const { envCode } = args as { envCode?: string }
      const data = await qosPost('/itom/machine/diagnosis/getTopology', { envCode: envCode ?? '' })
      return JSON.stringify(data, null, 2)
    }
    case 'get_subtopography': {
      const { envCode, rootAlarm, relatedAlarms } = args as {
        envCode?: string
        rootAlarm?: unknown
        relatedAlarms?: unknown[]
      }
      const body: Record<string, unknown> = { envCode: envCode ?? '', rootAlarm: rootAlarm ?? {} }
      if (Array.isArray(relatedAlarms) && relatedAlarms.length > 0) {
        body.relatedAlarms = JSON.stringify(relatedAlarms)
      }
      const data = await qosPost('/itom/machine/diagnosis/getSubTopology', body)
      return JSON.stringify(data, null, 2)
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
