export interface LCUCredentials {
  address: string
  port: number
  username: string
  password: string
  protocol: string
}

export interface RawChallenge {
  completedIds?: number[]
  name?: string
  description?: string
  currentValue?: unknown
  currentLevel?: unknown
  thresholds?: unknown
  availableIds?: unknown
  parentId?: unknown
  isCapstone?: unknown
}
