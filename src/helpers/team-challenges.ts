import type { Champion, ChampionRole } from "../types/lol"
import type { TeamChallenge, TeamChallengeGroup, TeamProgress, TierStatus } from "../types/team"
import ja from "../data/team-ja.json" with { type: "json" }

const levels = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
]
const roles = ["assassin", "fighter", "mage", "marksman", "support", "tank"]
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const finiteValue = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
export const isChampionId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0

export function buildProgress(raw: unknown): TeamProgress {
  const source = record(raw)
  const thresholds: TeamProgress["thresholds"] = {}
  const entries = Object.entries(record(source.thresholds))
  let thresholdsKnown = entries.length > 0
  for (const [level, entry] of entries) {
    const value = record(entry).value
    if (levels.includes(level) && finiteValue(value)) thresholds[level] = { value }
    else thresholdsKnown = false
  }
  const ordered = levels
    .filter((level) => thresholds[level])
    .map((level) => thresholds[level].value)
  if (ordered.some((value, i) => i > 0 && value < ordered[i - 1])) thresholdsKnown = false
  return {
    currentValue: finiteValue(source.currentValue) ? source.currentValue : null,
    currentLevel:
      typeof source.currentLevel === "string" && [...levels, "NONE"].includes(source.currentLevel)
        ? source.currentLevel
        : null,
    thresholds,
    thresholdsKnown,
  }
}

export function getTierStatus(progress: TeamProgress): TierStatus {
  if (progress.currentValue === null || !progress.thresholdsKnown) return { kind: "unknown" }
  for (const level of levels) {
    const tier = progress.thresholds[level]
    if (tier && tier.value > progress.currentValue) {
      return {
        kind: "next",
        level,
        value: tier.value,
        remaining: tier.value - progress.currentValue,
      }
    }
  }
  return { kind: "complete" }
}

export function getNextTier(progress: TeamProgress) {
  const status = getTierStatus(progress)
  return status.kind === "next" ? status : null
}

export function buildGroupProgress(rawMap: unknown, group: TeamChallengeGroup): TeamProgress {
  return buildProgress(record(rawMap)[group === "globetrotter" ? "303500" : "303400"])
}

export function buildTeamChallenges(rawMap: unknown, champions: Champion[]): TeamChallenge[] {
  const map = record(rawMap)
  const knownIds = new Set(champions.map((champion) => champion.id))
  return (["globetrotter", "harmony"] as const).flatMap((group) =>
    Array.from({ length: group === "globetrotter" ? 13 : 12 }, (_, index) => {
      const id = String((group === "globetrotter" ? 303501 : 303401) + index)
      const raw = record(map[id])
      const fallback = ja.challenges[id as keyof typeof ja.challenges]
      const localized = (value: unknown, defaultValue: string) =>
        typeof value === "string" && /[\u3040-\u30ff\u3400-\u9fff]/u.test(value)
          ? value
          : defaultValue
      const ids = Array.isArray(raw.availableIds)
        ? [...new Set(raw.availableIds.filter(isChampionId))]
        : []
      // Keep unknown positive IDs in the source list; never infer eligibility from lore.
      const eligibleChampionIds = ids.some((id) => knownIds.has(id)) ? ids : null
      return {
        ...buildProgress(raw),
        id,
        group,
        name: localized(raw.name, fallback.name),
        description: localized(raw.description, fallback.description),
        eligibleChampionIds,
        requiredCount: group === "globetrotter" || ["303407", "303408"].includes(id) ? 5 : 3,
        sameClass: id === "303408",
      }
    }),
  )
}

function hasRoles(champion: Champion): boolean {
  return (
    Array.isArray(champion.roles) &&
    champion.roles.length > 0 &&
    champion.roles.every((role) => roles.includes(role))
  )
}

export function getEligibleChampions(
  challenge: TeamChallenge,
  champions: Champion[],
  selectedRole: ChampionRole | null,
): Champion[] | null {
  if (challenge.sameClass) {
    if (
      !selectedRole ||
      !roles.includes(selectedRole) ||
      champions.length === 0 ||
      champions.some((champion) => !hasRoles(champion))
    )
      return null
    return champions.filter((champion) => champion.roles.includes(selectedRole))
  }
  if (!challenge.eligibleChampionIds) return null
  return champions.filter((champion) => challenge.eligibleChampionIds!.includes(champion.id))
}

export function getChampionMatch(
  challenge: TeamChallenge,
  champions: Champion[],
  id: number,
  selectedRole: ChampionRole | null,
): boolean | null {
  const champion = champions.find((champion) => champion.id === id)
  if (!champion) return null
  if (challenge.sameClass) {
    if (!selectedRole || !roles.includes(selectedRole) || !hasRoles(champion)) return null
    return champion.roles.includes(selectedRole)
  }
  return challenge.eligibleChampionIds ? challenge.eligibleChampionIds.includes(id) : null
}

export function getCompositionStatus(
  challenge: TeamChallenge,
  champions: Champion[],
  teamChampionIds: unknown[] | null,
  selectedRole: ChampionRole | null,
) {
  const ids = teamChampionIds ?? []
  const picked = ids.filter(isChampionId)
  const matches = picked.map((id) => getChampionMatch(challenge, champions, id, selectedRole))
  const validSlots = ids.every((id) => id === 0 || id === -1 || isChampionId(id))
  const known =
    teamChampionIds !== null &&
    ids.length <= 5 &&
    validSlots &&
    new Set(picked).size === picked.length &&
    matches.every((match) => match !== null) &&
    (challenge.sameClass
      ? !!selectedRole && roles.includes(selectedRole)
      : challenge.eligibleChampionIds !== null)
  const matched = matches.filter((match) => match === true).length
  return {
    known,
    matched,
    required: challenge.requiredCount,
    selected: picked.length,
    satisfied: known && picked.length === 5 && matched >= challenge.requiredCount,
  }
}

export function japaneseChampionName(champion: Champion): string {
  return ja.championNames[String(champion.id) as keyof typeof ja.championNames] ?? champion.name
}

export function rankLabel(level: string | null): string {
  const labels: Record<string, string> = {
    NONE: "ランクなし",
    IRON: "アイアン",
    BRONZE: "ブロンズ",
    SILVER: "シルバー",
    GOLD: "ゴールド",
    PLATINUM: "プラチナ",
    DIAMOND: "ダイヤモンド",
    MASTER: "マスター",
    GRANDMASTER: "グランドマスター",
    CHALLENGER: "チャレンジャー",
  }
  return level ? (labels[level] ?? level) : "ランク未取得"
}
