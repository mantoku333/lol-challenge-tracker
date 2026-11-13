<script setup lang="ts">
import { computed } from "vue"
import { challengeWithCompletion } from "../constants"
import type { RawChallenge } from "../types/lcu"
import type { Champion } from "../types/lol"

const props = defineProps<{
  candidateIds: number[]
  champions: Champion[]
  rawMap: Record<string, RawChallenge>
  ownPick: number | null
  teamPicks: number[] | null
}>()
const aramChallenges = computed(() => challengeWithCompletion.filter((item) => item.gameMode === "Aram"))
const candidates = computed(() => props.candidateIds.map((id) => ({
  id,
  name: props.champions.find((champion) => champion.id === id)?.name ?? `チャンピオン #${id}`,
  location: id === props.ownPick ? "自分のピック" : props.teamPicks?.includes(id) ? "味方のピック" : "ベンチ",
})))
function status(challengeId: string, championId: number) {
  const completed = props.rawMap[challengeId]?.completedIds
  if (!Array.isArray(completed)) return "進捗未取得"
  return completed.includes(championId) ? "達成済み" : "未達成"
}
</script>

<template>
  <section class="aram-candidates" aria-labelledby="aram-candidates-heading">
    <h2 id="aram-candidates-heading">ARAM ピック候補のチャレンジ</h2>
    <p>味方のピック・ベンチの全候補に対する、自分の達成状況です。</p>
    <div class="aram-candidate-grid">
      <article v-for="candidate in candidates" :key="candidate.id" class="aram-candidate">
        <strong>{{ candidate.name }}</strong>
        <span class="candidate-location">{{ candidate.location }}</span>
        <div v-for="challenge in aramChallenges" :key="challenge.id" class="candidate-challenge">
          <span :title="rawMap[challenge.id]?.description">{{ rawMap[challenge.id]?.name ?? 'All Random All Champs' }}</span>
          <span :class="{ completed: status(challenge.id, candidate.id) === '達成済み' }">
            {{ status(challenge.id, candidate.id) }}
          </span>
        </div>
      </article>
    </div>
    <p v-if="!candidates.length">ピック候補を待っています。</p>
  </section>
</template>

<style scoped>
.aram-candidates { border: 1px solid #785a28; padding: 18px; margin-bottom: 24px; }
h2 { color: #c8aa6e; font-size: 18px; margin: 0 0 8px; }
p, .candidate-location { color: #a09b8c; font-size: 12px; }
.aram-candidate-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
.aram-candidate { background: #101e2b; border: 1px solid #293345; padding: 12px; }
.candidate-location { display: block; margin: 4px 0 12px; }
.candidate-challenge { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
.candidate-challenge > span:last-child { white-space: nowrap; color: #edc5a9; }
.candidate-challenge > .completed { color: #0ac8b9 !important; }
</style>
