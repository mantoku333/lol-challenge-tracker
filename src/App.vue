<script setup lang="ts">
import { onMounted, ref, computed, watch } from "vue"
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome"
import { faGear } from "@fortawesome/free-solid-svg-icons"
import type { LCUCredentials, RawChallenge } from "./types/lcu"
import type { AramStats, Challenge, Champion, Summoner } from "./types/lol"
import type { StoredSettings } from "./types/app"
import type { TeamChallengeGroup } from "./types/team"
import { challengeFromCompletedIds, makeLCURequest, parseMerakiFile } from "./helpers/utils"
import { isChampionId } from "./helpers/team-challenges"
import { challengeWithCompletion } from "./constants"
import ChallengeSection from "./components/ChallengeSection.vue"
import TeamChallenges from "./components/TeamChallenges.vue"
import Settings from "./components/Settings.vue"
import LeagueDropdown from "./components/LeagueDropdown.vue"

const credentials = ref<LCUCredentials | null>(null)
const allChampions = ref<Champion[]>([])
const summoner = ref<Summoner | null>(null)
const challenges = ref<Challenge[]>([])
const rawMap = ref<Record<string, RawChallenge>>({})
const stats = ref<AramStats | null>(null)
const ownPick = ref<number | null>(null)
const teamPicks = ref<number[] | null>(null)
const group = ref<"champions" | TeamChallengeGroup>("champions")
const selectedChallengeIndex = ref(0)
const isColoredWhenDone = ref(false)
const showChampionNames = ref(false)
const settingsVisible = ref(false)
const loading = ref(false)
const error = ref("")
const statsError = ref("")
const picksConnected = ref(false)
const refreshedAt = ref("")
let requestId = 0
let refreshTimers: ReturnType<typeof setTimeout>[] = []

const selectedChamp = computed(
  () =>
    challenges.value[selectedChallengeIndex.value]?.champions.find(
      (champion) => champion.id === ownPick.value,
    ) ?? null,
)
const challengeOptions = computed(() =>
  challenges.value.map((challenge, index) => ({ name: challenge.name, value: index })),
)
watch(selectedChallengeIndex, (value) =>
  window.ipcRenderer.send("store-set", "selected-challenge-index", value),
)

const fetchAramStats = async () => {
  try {
    const response = await fetch(
      "https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json",
      { cache: "no-cache", signal: AbortSignal.timeout(12000) },
    )
    if (!response.ok) throw new Error("stats unavailable")
    stats.value = parseMerakiFile(await response.json())
    window.ipcRenderer.send("store-set", "aram-stats", JSON.stringify(stats.value))
    statsError.value = ""
  } catch {
    statsError.value = "ARAM補正データを取得できませんでした。チャレンジは引き続き利用できます。"
  }
}

const fetchLCU = async () => {
  const currentCredentials = credentials.value
  if (!currentCredentials) return
  const currentRequest = ++requestId
  loading.value = true
  error.value = ""
  try {
    const currentSummoner = await makeLCURequest<Summoner>(
      currentCredentials,
      "/lol-summoner/v1/current-summoner",
    )
    if (!currentSummoner?.summonerId) throw new Error("summoner unavailable")
    const [championsResponse, challengesResponse] = await Promise.all([
      makeLCURequest<Champion[]>(
        currentCredentials,
        `/lol-champions/v1/inventories/${currentSummoner.summonerId}/champions-minimal`,
      ),
      makeLCURequest<Record<string, RawChallenge>>(
        currentCredentials,
        "/lol-challenges/v1/challenges/local-player",
      ),
    ])
    if (currentRequest !== requestId) return
    if (
      !Array.isArray(championsResponse) ||
      !challengesResponse ||
      typeof challengesResponse !== "object" ||
      Array.isArray(challengesResponse)
    )
      throw new Error("unexpected LCU data")
    const champions = championsResponse
      .filter(
        (champion) =>
          isChampionId(champion?.id) &&
          champion.isVisibleInClient &&
          typeof champion.alias === "string" &&
          typeof champion.name === "string" &&
          !champion.alias.toLowerCase().startsWith("jade_"),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
    if (champions.length === 0) throw new Error("champions unavailable")
    summoner.value = currentSummoner
    allChampions.value = champions
    rawMap.value = challengesResponse
    challenges.value = challengeWithCompletion
      .filter((item) => Array.isArray(challengesResponse[item.id]?.completedIds))
      .map((item) =>
        challengeFromCompletedIds(challengesResponse[item.id], champions, item.gameMode),
      )
    if (selectedChallengeIndex.value >= challenges.value.length) selectedChallengeIndex.value = 0
    refreshedAt.value = new Date().toLocaleTimeString("ja-JP")
  } catch {
    if (currentRequest !== requestId) return
    rawMap.value = {}
    challenges.value = []
    refreshedAt.value = ""
    error.value = "進捗を取得できませんでした。LoLへのログインを確認し、更新してください。"
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

const updateSettings = (settings: StoredSettings) => {
  isColoredWhenDone.value = settings.isColoredWhenDone
  showChampionNames.value = settings.showChampionNames
  window.ipcRenderer.send("store-set", "settings", JSON.stringify(settings))
}
const clearPicks = () => {
  ownPick.value = null
  teamPicks.value = null
}
const clearTimers = () => {
  refreshTimers.forEach(clearTimeout)
  refreshTimers = []
}

window.ipcRenderer.on("credentials", (_event, nextCredentials: LCUCredentials | null) => {
  ++requestId
  clearTimers()
  clearPicks()
  credentials.value = nextCredentials
  rawMap.value = {}
  challenges.value = []
  allChampions.value = []
  summoner.value = null
  refreshedAt.value = ""
  loading.value = false
  error.value = ""
  if (nextCredentials) void fetchLCU()
})
window.ipcRenderer.on("pick", (_event, id: number | null) => {
  ownPick.value = isChampionId(id) ? id : null
})
window.ipcRenderer.on("team-picks", (_event, ids: number[] | null) => {
  teamPicks.value = ids
})
window.ipcRenderer.on("picks-connected", (_event, connected: boolean) => {
  picksConnected.value = connected
  if (!connected) clearPicks()
})
window.ipcRenderer.on("end-of-game", () => {
  clearPicks()
  clearTimers()
  void fetchLCU()
  refreshTimers = [3000, 10000].map((delay) => setTimeout(() => void fetchLCU(), delay))
})
window.ipcRenderer.on(
  "game-start",
  (_event, selections: { championId: number; puuid: string }[]) => {
    teamPicks.value = null
    const championId = selections?.find(
      (selection) => selection.puuid === summoner.value?.puuid,
    )?.championId
    ownPick.value = isChampionId(championId) ? championId : null
  },
)
window.ipcRenderer.on("refetch", () => void fetchLCU())

onMounted(async () => {
  window.ipcRenderer.send("app-ready")
  try {
    const [storedStats, storedSettings, storedIndex] = await Promise.all(
      ["aram-stats", "settings", "selected-challenge-index"].map((key) =>
        window.ipcRenderer.invoke("store-get", key),
      ),
    )
    if (storedStats) stats.value = JSON.parse(storedStats)
    if (storedSettings) {
      const settings = JSON.parse(storedSettings)
      isColoredWhenDone.value = settings.isColoredWhenDone === true
      showChampionNames.value = settings.showChampionNames === true
    }
    if (
      Number.isInteger(Number(storedIndex)) &&
      Number(storedIndex) >= 0 &&
      Number(storedIndex) < challengeWithCompletion.length
    )
      selectedChallengeIndex.value = Number(storedIndex)
  } catch {
    /* Corrupt optional preferences must not prevent connecting. */
  }
  if (!stats.value) void fetchAramStats()
})
</script>

<template>
  <div class="app">
    <header class="app-header">
      <strong>LoL Challenge Tracker</strong
      ><button
        class="league-button settings-button"
        aria-label="設定"
        @click="settingsVisible = !settingsVisible"
      >
        <FontAwesomeIcon :icon="faGear" />
      </button>
    </header>
    <nav class="group-tabs" aria-label="チャレンジの種類">
      <button
        class="league-button"
        :aria-pressed="group === 'champions'"
        @click="group = 'champions'"
      >
        チャンプ別</button
      ><button
        class="league-button"
        :aria-pressed="group === 'globetrotter'"
        @click="group = 'globetrotter'"
      >
        世界旅行</button
      ><button class="league-button" :aria-pressed="group === 'harmony'" @click="group = 'harmony'">
        調和
      </button>
    </nav>
    <div class="connection-bar" role="status">
      <span
        >{{
          !credentials
            ? "LoLクライアントへの接続待ち"
            : loading
              ? "進捗を取得中…"
              : "LoLクライアント接続中"
        }}<template v-if="credentials && !picksConnected"> · ピック通知を接続中</template
        ><template v-if="refreshedAt"> · 最終更新 {{ refreshedAt }}</template></span
      ><button class="league-button" :disabled="!credentials || loading" @click="fetchLCU">
        更新
      </button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <TeamChallenges
      v-if="group !== 'champions'"
      :key="group"
      :group="group"
      :raw-map="rawMap"
      :champions="allChampions"
      :team-picks="teamPicks"
      :own-pick="ownPick"
    />
    <template v-else>
      <div class="app-heading">
        <LeagueDropdown
          v-if="challengeOptions.length"
          v-model="selectedChallengeIndex"
          :options="challengeOptions"
        />
      </div>
      <ChallengeSection
        v-if="challenges[selectedChallengeIndex]"
        :challenge="challenges[selectedChallengeIndex]"
        :all-champions="allChampions"
        :selected-champ="selectedChamp"
        :is-colored-when-done="isColoredWhenDone"
        :show-champion-names="showChampionNames"
        :stats="stats"
      />
      <p v-else class="waiting">
        {{
          credentials
            ? "チャンプ別チャレンジの進捗未取得"
            : "LoLクライアントを起動してログインしてください。世界旅行・調和の項目は接続前でも確認できます。"
        }}
      </p>
      <p v-if="statsError" class="optional-error">{{ statsError }}</p>
    </template>
    <Settings
      v-model:visible="settingsVisible"
      :is-colored-when-done="isColoredWhenDone"
      :show-champion-names="showChampionNames"
      @update:isColoredWhenDone="
        (value) => updateSettings({ isColoredWhenDone: value, showChampionNames })
      "
      @update:showChampionNames="
        (value) => updateSettings({ isColoredWhenDone, showChampionNames: value })
      "
      @refetch="fetchLCU"
      @refetch-aram-stats="fetchAramStats"
    />
  </div>
</template>

<style>
.app {
  background: var(--main-bg-gradient);
  border-top: solid 2px #785a28;
  position: relative;
  padding: 24px;
  color: var(--main-text-color);
  min-height: 100vh;
  box-sizing: border-box;
}
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.app-header > strong {
  font-family: "BeaufortforLOL Bold", serif;
  font-size: 20px;
  color: #c8aa6e;
}
.settings-button {
  width: 36px;
  height: 36px;
  border-radius: 50%;
}
.group-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.group-tabs button {
  padding: 9px 22px;
}
.group-tabs button[aria-pressed="true"] {
  border-color: #0ac8b9;
  color: #0ac8b9;
  background: #12303a;
}
.connection-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: #a09b8c;
  padding-bottom: 18px;
  margin-bottom: 20px;
  border-bottom: 1px solid #293345;
}
.connection-bar button {
  font-size: 13px;
  padding: 4px 15px;
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
.app-heading {
  width: 320px;
  margin-bottom: 16px;
}
.error {
  border-left: 3px solid #d49266;
  padding: 12px 16px;
  background: #2e2422;
  color: #edc5a9;
}
.waiting {
  padding: 36px 0;
  color: #b8b5ac;
}
.optional-error {
  color: #a09b8c;
  font-size: 12px;
}
</style>
