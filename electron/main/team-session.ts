// Only myTeam is authoritative for the current (including swapped/unselected) picks.
// Do not fall back to old pick actions after a slot has been cleared.
export function parseTeamSession(data: unknown): { team: number[] | null; own: number | null } {
  const empty = { team: null, own: null }
  if (!data || typeof data !== "object") return empty
  const session = data as Record<string, unknown>
  if (!Array.isArray(session.myTeam) || session.myTeam.length === 0 || session.myTeam.length > 5)
    return empty
  const cells = new Set<number>()
  const team: number[] = []
  let own: number | null = null
  for (const member of session.myTeam) {
    if (
      !member ||
      !Number.isSafeInteger(member.cellId) ||
      member.cellId < 0 ||
      cells.has(member.cellId) ||
      !Number.isSafeInteger(member.championId) ||
      member.championId < -1
    )
      return empty
    cells.add(member.cellId)
    team.push(member.championId)
    if (member.cellId === session.localPlayerCellId && member.championId > 0)
      own = member.championId
  }
  return { team, own }
}
