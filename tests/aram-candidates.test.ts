import test from "node:test"
import assert from "node:assert/strict"
import { parseAramCandidates } from "../electron/main/team-session.ts"

const session = {
  benchEnabled: true,
  localPlayerCellId: 0,
  myTeam: [{ cellId: 0, championId: 1 }, { cellId: 1, championId: 2 }],
  benchChampions: [{ championId: 3 }, { championId: 4 }, { championId: 1 }],
}
test("ARAM includes all team picks and bench candidates once", () => {
  assert.deepEqual(parseAramCandidates(session), [1, 2, 3, 4])
})
test("rerolls, swaps and empty bench use current session", () => {
  assert.deepEqual(parseAramCandidates({ ...session, myTeam: [{ cellId: 0, championId: 4 }], benchChampions: [{ championId: 1 }] }), [4, 1])
  assert.deepEqual(parseAramCandidates({ ...session, benchChampions: [] }), [1, 2])
})
test("other queues, deleted and invalid sessions clear candidates", () => {
  for (const data of [null, {}, { ...session, benchEnabled: false }, { ...session, myTeam: [] }])
    assert.equal(parseAramCandidates(data), null)
})
test("invalid bench entries and unselected slots never become candidates", () => {
  assert.deepEqual(parseAramCandidates({ ...session, myTeam: [{ cellId: 0, championId: 0 }], benchChampions: [null, {}, { championId: -1 }, { championId: "3" }, { championId: 4 }] }), [4])
})
