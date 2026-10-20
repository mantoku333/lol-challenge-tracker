import test from "node:test"
import assert from "node:assert/strict"
import {
  buildTeamChallenges,
  buildGroupProgress,
  buildProgress,
  getTierStatus,
  getNextTier,
  getEligibleChampions,
  getCompositionStatus,
  getChampionMatch,
} from "../src/helpers/team-challenges.ts"
import { parseTeamSession } from "../electron/main/team-session.ts"

const champions = Array.from({ length: 6 }, (_, index) => ({
  id: index + 1,
  name: `Champion ${index + 1}`,
  alias: `Champion${index + 1}`,
  roles: index === 5 ? ["tank"] : ["fighter", "mage"],
  isVisibleInClient: true,
})) as any
const make = (id = "303401", raw: object = {}) =>
  buildTeamChallenges({ [id]: { availableIds: [1, 2, 3], ...raw } }, champions).find(
    (item) => item.id === id,
  )!
const thresholds = {
  GOLD: { value: 1 },
  PLATINUM: { value: 3 },
  DIAMOND: { value: 5 },
  MASTER: { value: 8 },
  GRANDMASTER: { value: 10 },
  CHALLENGER: { value: 15 },
}

test("exactly 25 children, distinct from 2 capstones", () => {
  const list = buildTeamChallenges({}, champions)
  assert.equal(list.length, 25)
  assert.equal(new Set(list.map((item) => item.id)).size, 25)
  assert.equal(list.filter((item) => item.group === "globetrotter").length, 13)
  assert.equal(list.filter((item) => item.group === "harmony").length, 12)
  assert.ok(list.every((item) => !["303400", "303500"].includes(item.id)))
  assert.equal(
    buildGroupProgress({ 303500: { currentValue: 125 } }, "globetrotter").currentValue,
    125,
  )
})
test("Japanese fallbacks and Japanese LCU names take precedence", () => {
  assert.equal(make("303408", { name: "One Trick" }).name, "一つの信念")
  assert.equal(make("303408", { name: "クライアント名" }).name, "クライアント名")
})
test("zero is valid; absent, null, string, negative and nonfinite progress are unknown", () => {
  assert.equal(make("303401", { currentValue: 0 }).currentValue, 0)
  for (const currentValue of [undefined, null, "0", -1, NaN, Infinity])
    assert.equal(make("303401", { currentValue }).currentValue, null)
})
test("missing, empty or unusable availableIds is unknown", () => {
  for (const availableIds of [undefined, null, [], [0, -1, "1"], [999]])
    assert.equal(make("303401", { availableIds }).eligibleChampionIds, null)
  assert.deepEqual(
    make("303401", { availableIds: [1, 1, 2, 999] }).eligibleChampionIds,
    [1, 2, 999],
  )
})
test("progress uses actual thresholds, including tiers beyond Master", () => {
  assert.deepEqual(getNextTier(buildProgress({ currentValue: 8, thresholds })), {
    kind: "next",
    level: "GRANDMASTER",
    value: 10,
    remaining: 2,
  })
  assert.equal(getNextTier(buildProgress({ currentValue: 10, thresholds }))?.remaining, 5)
  assert.equal(
    getNextTier(buildProgress({ currentValue: 0, thresholds: { GOLD: { value: 7 } } }))?.remaining,
    7,
  )
})
test("highest tier is distinguished from missing or malformed thresholds", () => {
  assert.equal(getTierStatus(buildProgress({ currentValue: 15, thresholds })).kind, "complete")
  for (const raw of [
    {},
    { currentValue: 0 },
    { currentValue: 50, thresholds: {} },
    { thresholds },
    { currentValue: 50, thresholds: { GOLD: { value: "1" } } },
    { currentValue: 50, thresholds: { GOLD: { value: 5 }, MASTER: { value: 3 } } },
    { currentValue: 50, thresholds: { FUTURE: { value: 1 } } },
  ])
    assert.equal(getTierStatus(buildProgress(raw)).kind, "unknown")
})
test("required counts cover all exceptions", () => {
  for (const challenge of buildTeamChallenges({}, champions))
    assert.equal(
      challenge.requiredCount,
      challenge.group === "globetrotter" || ["303407", "303408"].includes(challenge.id) ? 5 : 3,
    )
})
test("3 matches cannot complete an unfinished team", () => {
  for (const picks of [
    [1, 2, 3],
    [1, 2, 3, 4, 0],
    [1, 2, 3, 4, -1],
  ]) {
    const status = getCompositionStatus(make(), champions, picks, null)
    assert.equal(status.matched, 3)
    assert.equal(status.satisfied, false)
  }
  assert.equal(getCompositionStatus(make(), champions, [1, 2, 3, 4, 5], null).satisfied, true)
})
test("5-required challenges need all five matching champions", () => {
  for (const id of ["303501", "303407"]) {
    assert.equal(getCompositionStatus(make(id), champions, [1, 2, 3, 4, 5], null).satisfied, false)
    assert.equal(
      getCompositionStatus(
        make(id, { availableIds: [1, 2, 3, 4, 5] }),
        champions,
        [1, 2, 3, 4, 5],
        null,
      ).satisfied,
      true,
    )
  }
})
test("unknown, duplicate, malformed and oversized teams never satisfy", () => {
  for (const picks of [
    null,
    [1, 2, 3, 4, 999],
    [1, 2, 3, 4, 4],
    [1, 2, 3, 4, -2],
    [1, 2, 3, 4, 5, 6],
    [1, 2, 3, 4, "5"],
    [1, 2, 3, 4, NaN],
    [1, 2, 3, 4, null],
  ]) {
    const status = getCompositionStatus(make(), champions, picks, null)
    assert.equal(status.known, false)
    assert.equal(status.satisfied, false)
  }
})
test("secondary class is eligible; role selection is mandatory", () => {
  const challenge = make("303408")
  assert.equal(getEligibleChampions(challenge, champions, "mage")?.length, 5)
  assert.equal(getCompositionStatus(challenge, champions, [1, 2, 3, 4, 5], "mage").satisfied, true)
  assert.equal(getCompositionStatus(challenge, champions, [1, 2, 3, 4, 5], null).known, false)
  assert.equal(getCompositionStatus(challenge, champions, [1, 2, 3, 4, 6], "mage").satisfied, false)
})
test("missing role metadata means unknown, not ineligible", () => {
  const missing = champions.map((champion: any) =>
    champion.id === 5 ? { ...champion, roles: undefined } : champion,
  )
  assert.equal(getChampionMatch(make("303408"), missing, 5, "mage"), null)
  assert.equal(getEligibleChampions(make("303408"), missing, "mage"), null)
  assert.equal(getCompositionStatus(make("303408"), missing, [1, 2, 3, 4, 5], "mage").known, false)
})
test("changing the selected challenge recomputes own pick and composition", () => {
  const first = make("303401", { availableIds: [1, 2, 3] })
  const second = make("303402", { availableIds: [4, 5, 6] })
  assert.equal(getChampionMatch(first, champions, 1, null), true)
  assert.equal(getChampionMatch(second, champions, 1, null), false)
  assert.equal(getCompositionStatus(second, champions, [1, 2, 3, 4, 5], null).satisfied, false)
})
test("session snapshots, swaps and unselect use current myTeam", () => {
  const myTeam = Array.from({ length: 5 }, (_, cellId) => ({ cellId, championId: cellId + 1 }))
  assert.deepEqual(parseTeamSession({ myTeam, localPlayerCellId: 2 }), {
    team: [1, 2, 3, 4, 5],
    own: 3,
  })
  myTeam[2].championId = 0
  assert.deepEqual(
    parseTeamSession({ myTeam, localPlayerCellId: 2, actions: [[{ championId: 3 }]] }),
    { team: [1, 2, 0, 4, 5], own: null },
  )
  myTeam[0].championId = 2
  myTeam[1].championId = 1
  assert.equal(parseTeamSession({ myTeam, localPlayerCellId: 0 }).own, 2)
})
test("deleted and malformed sessions clear picks", () => {
  for (const data of [
    null,
    undefined,
    {},
    { myTeam: [] },
    { myTeam: [null] },
    { myTeam: [{ cellId: 0 }] },
    {
      myTeam: [
        { cellId: 0, championId: 1 },
        { cellId: 0, championId: 2 },
      ],
    },
  ])
    assert.deepEqual(parseTeamSession(data), { team: null, own: null })
})
