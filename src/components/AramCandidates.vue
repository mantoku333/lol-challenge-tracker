<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { challengeWithCompletion } from "../constants"
import type { RawChallenge } from "../types/lcu"
import type { Champion } from "../types/lol"

const props = defineProps<{
  candidateIds: number[]
  champions: Champion[]
  rawMap: Record<string, RawChallenge>
  ownPick: number | null
  isColoredWhenDone: boolean
}>()
const aramChallenges = computed(() => challengeWithCompletion.filter((item) => item.gameMode === "Aram"))
const iconVersion = ref<string | null>(null)
onMounted(async () => {
  try {
    const response = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return
    const versions = await response.json()
    if (Array.isArray(versions) && typeof versions[0] === "string" && /^\d+\.\d+\.\d+$/.test(versions[0]))
      iconVersion.value = versions[0]
  } catch { /* Keep the existing icon source when version lookup is unavailable. */ }
})
const candidates = computed(() => props.candidateIds.map((id) => ({
  id,
  name: props.champions.find((champion) => champion.id === id)?.name ?? `チャンピオン #${id}`,
  alias: props.champions.find((champion) => champion.id === id)?.alias,
  location: id === props.ownPick ? "自分のピック" : "ベンチ",
})))
function status(challengeId: string, championId: number) {
  const completed = props.rawMap[challengeId]?.completedIds
  if (!Array.isArray(completed)) return "進捗未取得"
  return completed.includes(championId) ? "Done" : "Not Done"
}
</script>

<template>
  <section class="aram-candidates" aria-label="ARAM Champ Select Preview">
    <div class="selected-champ-text">Champ Select Preview</div>
    <div class="preview-challenge">{{ rawMap[aramChallenges[0]?.id]?.name ?? 'All Random All Champs' }}</div>
    <div class="aram-candidate-grid">
      <article v-for="candidate in candidates" :key="candidate.id" class="aram-candidate">
        <a
          :href="candidate.alias ? `https://aram.zone/champion/${candidate.alias.toLowerCase()}` : undefined"
          target="_blank"
          :aria-label="candidate.name"
          :title="candidate.name"
          :class="{ 'own-pick': candidate.id === ownPick }"
        >
          <img
            :src="iconVersion && candidate.alias ? `https://ddragon.leagueoflegends.com/cdn/${iconVersion}/img/champion/${candidate.alias === 'FiddleSticks' ? 'Fiddlesticks' : candidate.alias}.png` : `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${candidate.id}.png`"
            :alt="candidate.name"
            :class="{ greyed: status(aramChallenges[0]?.id, candidate.id) !== '進捗未取得' && (isColoredWhenDone ? status(aramChallenges[0]?.id, candidate.id) === 'Done' : status(aramChallenges[0]?.id, candidate.id) === 'Not Done') }"
          />
          <span v-if="status(aramChallenges[0]?.id, candidate.id) === 'Done'" class="completion-check" aria-label="Done">✓</span>
        </a>
        <div class="candidate-name">{{ candidate.name }}</div>
        <span class="candidate-location">{{ candidate.location }}</span>
        <div v-for="challenge in aramChallenges" :key="challenge.id" class="candidate-challenge">
          <span :class="{ completed: status(challenge.id, candidate.id) === 'Done' }">
            {{ status(challenge.id, candidate.id) }}
          </span>
        </div>
      </article>
    </div>
    <p v-if="!candidates.length">ピック候補を待っています。</p>
  </section>
</template>

<style scoped>
.aram-candidates { width: 100%; }
.selected-champ-text { margin-bottom: 4px; }
.preview-challenge { color: #a09b8c; font-size: 12px; margin-bottom: 12px; }
.aram-candidate-grid { display: flex; flex-wrap: wrap; gap: 16px; }
.aram-candidate { width: 128px; text-align: center; }
a { display: block; position: relative; width: 128px; height: 128px; border: 1px solid #3c3c41; }
a.own-pick { border-color: #c8aa6e; }
img { width: 128px; height: 128px; }
.greyed { filter: brightness(30%); }
.candidate-name { color: #c8aa6e; margin-top: 6px; font-size: 13px; }
.candidate-location { display: block; color: #a09b8c; font-size: 11px; margin: 3px 0; }
.candidate-challenge { font-size: 13px; color: #edc5a9; }
.completed { color: #0ac8b9; }
.completion-check { position: absolute; top: -8px; right: -8px; background: #0ac8b9; color: black; border: 2px solid black; border-radius: 50%; padding: 2px 6px; }
</style>
