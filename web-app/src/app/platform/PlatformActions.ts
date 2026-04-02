export const PLATFORM_ACTION_IDS = ['chat.startNew'] as const

export type PlatformActionId = typeof PLATFORM_ACTION_IDS[number]

export function isPlatformActionId(value: string): value is PlatformActionId {
    return PLATFORM_ACTION_IDS.includes(value as PlatformActionId)
}

