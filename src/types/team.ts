export type TeamChallengeGroup = "globetrotter" | "harmony"

export interface TeamProgress {
  currentValue: number | null
  currentLevel: string | null
  thresholds: Record<string, { value: number }>
  thresholdsKnown: boolean
}

export interface TeamChallenge extends TeamProgress {
  id: string
  group: TeamChallengeGroup
  name: string
  description: string
  eligibleChampionIds: number[] | null
  requiredCount: number
  sameClass: boolean
}

export type TierStatus =
  | { kind: "unknown" }
  | { kind: "complete" }
  | { kind: "next"; level: string; value: number; remaining: number }
