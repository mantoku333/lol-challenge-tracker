<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { Champion, ChampionRole } from "../types/lol"
import type { TeamChallengeGroup, TeamProgress } from "../types/team"
import {
  buildTeamChallenges,
  buildGroupProgress,
  getEligibleChampions,
  getCompositionStatus,
  getChampionMatch,
  getTierStatus,
  japaneseChampionName,
  rankLabel,
} from "../helpers/team-challenges"

const props = defineProps<{
  group: TeamChallengeGroup
  rawMap: unknown
  champions: Champion[]
  teamPicks: number[] | null
  ownPick: number | null
}>()
const list = computed(() =>
  buildTeamChallenges(props.rawMap, props.champions).filter((item) => item.group === props.group),
)
const parent = computed(() => buildGroupProgress(props.rawMap, props.group))
const selectedId = ref("")
watch(
  () => props.group,
  () => {
    selectedId.value = list.value[0].id
  },
  { immediate: true },
)
const challenge = computed(
  () => list.value.find((item) => item.id === selectedId.value) ?? list.value[0],
)
const role = ref<ChampionRole | null>(null)
const search = ref("")
const roleOptions: { value: ChampionRole; name: string }[] = [
  { value: "assassin", name: "アサシン" },
  { value: "fighter", name: "ファイター" },
  { value: "mage", name: "メイジ" },
  { value: "marksman", name: "マークスマン" },
  { value: "support", name: "サポート" },
  { value: "tank", name: "タンク" },
]
const eligible = computed(() => getEligibleChampions(challenge.value, props.champions, role.value))
const filtered = computed(() =>
  (eligible.value ?? [])
    .filter((champion) =>
      `${japaneseChampionName(champion)} ${champion.name} ${champion.alias}`
        .toLocaleLowerCase()
        .includes(search.value.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => japaneseChampionName(a).localeCompare(japaneseChampionName(b), "ja")),
)
const status = computed(() =>
  getCompositionStatus(challenge.value, props.champions, props.teamPicks, role.value),
)
const slots = computed(() =>
  Array.from({ length: 5 }, (_, index) => {
    const id = props.teamPicks?.[index] ?? 0
    const champion = props.champions.find((champion) => champion.id === id)
    return {
      id,
      name:
        id <= 0 ? "未選択" : champion ? japaneseChampionName(champion) : `不明なチャンプ (${id})`,
      match: id > 0 ? getChampionMatch(challenge.value, props.champions, id, role.value) : null,
    }
  }),
)
const ownLabel = computed(() => {
  if (!props.ownPick) return "自分のピック：未選択"
  const champion = props.champions.find((champion) => champion.id === props.ownPick)
  const match = getChampionMatch(challenge.value, props.champions, props.ownPick, role.value)
  return `自分のピック：${champion ? japaneseChampionName(champion) : props.ownPick} ／ ${match === null ? "未判定" : match ? "対象" : "対象外"}`
})
function nextLabel(progress: TeamProgress, unit = "勝") {
  const tier = getTierStatus(progress)
  return tier.kind === "unknown"
    ? "次ランク：進捗・閾値未取得"
    : tier.kind === "complete"
      ? "取得した最高段階に到達"
      : `${rankLabel(tier.level)}まで あと${tier.remaining}${unit}`
}
const icon = (id: number) =>
  `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png`
</script>

<template>
  <section class="team-view">
    <header class="group-heading">
      <div>
        <span class="eyebrow">5人プリメイドのチャレンジ</span>
        <h1>
          {{ group === "globetrotter" ? "世界旅行" : "調和" }} <small>{{ list.length }}項目</small>
        </h1>
      </div>
      <div class="parent-progress">
        <span>グループ進捗（親）</span
        ><strong>{{
          parent.currentValue === null ? "進捗未取得" : `${parent.currentValue} ポイント`
        }}</strong
        ><span>{{ rankLabel(parent.currentLevel) }} · {{ nextLabel(parent, "ポイント") }}</span>
      </div>
    </header>
    <p class="notice">
      5人プリメイド・対象モードでの勝利が必要です。構成プレビューは達成を保証するものではありません。
    </p>
    <div class="team-layout">
      <nav class="challenge-list" aria-label="構成チャレンジ">
        <button
          v-for="item in list"
          :key="item.id"
          :aria-pressed="item.id === challenge.id"
          :class="{ active: item.id === challenge.id }"
          @click="selectedId = item.id"
        >
          <strong>{{ item.name }}</strong>
          <span
            >{{ item.currentValue === null ? "進捗未取得" : `${item.currentValue} 勝` }} ·
            {{ rankLabel(item.currentLevel) }}</span
          >
          <small>{{ nextLabel(item) }}</small>
        </button>
      </nav>
      <div class="challenge-detail">
        <div class="detail-heading">
          <span class="eyebrow"
            >{{ challenge.id }} · 対象 {{ challenge.requiredCount }}体が必要</span
          >
          <h2>{{ challenge.name }}</h2>
          <p>{{ challenge.description }}</p>
        </div>
        <div class="progress-row">
          <strong>{{
            challenge.currentValue === null ? "進捗未取得" : `${challenge.currentValue} 勝`
          }}</strong
          ><span>{{ rankLabel(challenge.currentLevel) }}</span
          ><span>{{ nextLabel(challenge) }}</span>
        </div>
        <label v-if="challenge.sameClass" class="role-picker"
          >判定するクラス
          <select class="league-select" v-model="role">
            <option :value="null">クラスを選択</option>
            <option v-for="option in roleOptions" :key="option.value" :value="option.value">
              {{ option.name }}
            </option>
          </select>
          <small>第2クラスも含みます。レーンの分類とは異なります。</small>
        </label>
        <section class="composition" aria-label="味方の構成プレビュー">
          <div class="composition-heading">
            <h3>味方のピック</h3>
            <strong :class="{ satisfied: status.satisfied }" aria-live="polite">{{
              !teamPicks
                ? "チャンピオン選択待ち"
                : !status.known
                  ? "構成未判定"
                  : status.satisfied
                    ? "構成条件を満たす"
                    : status.selected < 5
                      ? "構成選択中"
                      : "構成条件を満たしていません"
            }}</strong>
          </div>
          <p>
            対象 {{ status.known ? status.matched : "—" }} / 必要 {{ status.required }} · 選択済み
            {{ status.selected }} / 5
          </p>
          <div class="team-slots">
            <div
              v-for="(slot, index) in slots"
              :key="index"
              class="team-slot"
              :class="{ matched: slot.match === true }"
            >
              <img v-if="slot.id > 0" :src="icon(slot.id)" alt="" /><span v-else class="empty-slot"
                >?</span
              ><span>{{ slot.name }}</span
              ><small>{{
                slot.id <= 0 ? "—" : slot.match === null ? "未判定" : slot.match ? "対象" : "対象外"
              }}</small>
            </div>
          </div>
          <p class="own-pick">{{ ownLabel }}</p>
        </section>
        <div class="eligible-heading">
          <h3>
            対象チャンピオン <small v-if="eligible">{{ eligible.length }}体</small>
          </h3>
          <input
            class="league-input"
            v-model="search"
            type="search"
            aria-label="対象チャンピオンを検索"
            placeholder="日本語・英語で検索"
          />
        </div>
        <p v-if="eligible === null" class="empty-state">
          {{
            challenge.sameClass && !role
              ? "クラスを選択すると対象チャンピオンを表示します。"
              : "対象チャンプ未取得。接続状態を確認して更新してください。"
          }}
        </p>
        <p v-else-if="filtered.length === 0" class="empty-state">
          検索条件に一致するチャンピオンがいません。
        </p>
        <div v-else class="eligible-grid">
          <div
            v-for="champion in filtered"
            :key="champion.id"
            class="eligible-champion"
            :class="{ picked: teamPicks?.includes(champion.id) }"
          >
            <img :src="icon(champion.id)" alt="" loading="lazy" /><span>{{
              japaneseChampionName(champion)
            }}</span
            ><small v-if="teamPicks?.includes(champion.id)">味方が選択中</small>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.group-heading,
.composition-heading,
.eligible-heading,
.progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
h1,
h2,
h3,
p {
  margin: 0;
}
h1 {
  font-size: 30px;
  margin-top: 4px;
}
h2 {
  font-size: 25px;
  margin: 6px 0 12px;
}
h3 {
  font-size: 17px;
}
small {
  font-size: 12px;
  font-weight: normal;
}
h1 small,
h3 small {
  color: #a09b8c;
  margin-left: 8px;
}
.eyebrow,
.parent-progress > span {
  font-size: 12px;
  color: #a09b8c;
}
.parent-progress {
  display: grid;
  gap: 4px;
  text-align: right;
}
.parent-progress strong {
  color: #c8aa6e;
  font-size: 20px;
}
.notice {
  color: #b8b5ac;
  font-size: 13px;
  margin: 20px 0;
  padding: 12px 16px;
  background: #101e30;
  border-left: 3px solid #785a28;
}
.team-layout {
  display: grid;
  grid-template-columns: 290px minmax(0, 1fr);
  gap: 24px;
}
.challenge-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-self: start;
}
.challenge-list button {
  display: grid;
  text-align: left;
  gap: 5px;
  padding: 12px 14px;
  background: #0b192b;
  border: 1px solid #293345;
  color: #f0e6d2;
  cursor: pointer;
  font-family: inherit;
}
.challenge-list button span,
.challenge-list button small {
  color: #a09b8c;
}
.challenge-list button.active {
  border-color: #c8aa6e;
  background: #1b2833;
  box-shadow: inset 3px 0 #c8aa6e;
}
.challenge-list button:hover {
  background: #1b2833;
}
.challenge-list button:focus-visible {
  outline: 2px solid #0ac8b9;
  outline-offset: 2px;
}
.challenge-detail {
  min-width: 0;
}
.detail-heading p {
  color: #b8b5ac;
  line-height: 1.8;
}
.progress-row {
  justify-content: flex-start;
  margin: 20px 0;
  padding: 14px 18px;
  border: 1px solid #34414c;
}
.progress-row strong {
  font-size: 26px;
  color: #c8aa6e;
}
.progress-row span {
  font-size: 14px;
}
.role-picker {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.role-picker small {
  color: #a09b8c;
}
.composition {
  padding: 18px;
  background: #101e30;
  border: 1px solid #293345;
  margin-bottom: 24px;
}
.composition-heading strong {
  font-size: 14px;
  color: #c8aa6e;
}
.composition-heading strong.satisfied {
  color: #0ac8b9;
}
.composition p {
  font-size: 13px;
  color: #b8b5ac;
  margin: 10px 0;
}
.team-slots {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}
.team-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  font-size: 12px;
}
.team-slot img,
.empty-slot {
  width: 64px;
  height: 64px;
  border: 2px solid #34414c;
  border-radius: 4px;
  object-fit: cover;
}
.empty-slot {
  display: grid;
  place-content: center;
  font-size: 30px;
  color: #566377;
  background: #091428;
}
.team-slot.matched img {
  border-color: #0ac8b9;
}
.team-slot small {
  color: #a09b8c;
}
.team-slot.matched small {
  color: #0ac8b9;
}
.composition .own-pick {
  border-top: 1px solid #293345;
  padding-top: 12px;
  margin-bottom: 0;
}
.eligible-heading {
  margin-bottom: 16px;
}
.eligible-heading input {
  max-width: 230px;
}
.eligible-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 14px;
}
.eligible-champion {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  font-size: 12px;
}
.eligible-champion img {
  width: 72px;
  height: 72px;
  border: 2px solid #34414c;
  border-radius: 4px;
}
.eligible-champion.picked img {
  border-color: #0ac8b9;
}
.eligible-champion small {
  color: #0ac8b9;
}
.empty-state {
  color: #a09b8c;
  padding: 24px 0;
}
@media (max-width: 850px) {
  .team-layout {
    grid-template-columns: 1fr;
  }
  .challenge-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    max-height: 260px;
    overflow: auto;
  }
  .parent-progress {
    text-align: left;
  }
  .team-slots {
    gap: 4px;
  }
  .team-slot img,
  .empty-slot {
    width: 48px;
    height: 48px;
  }
}
</style>
