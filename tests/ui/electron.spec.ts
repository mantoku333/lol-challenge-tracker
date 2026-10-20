import { test, expect, _electron as electron } from "@playwright/test"
import { mkdir, mkdtemp } from "node:fs/promises"
import path from "node:path"

test("Electron: Japanese groups, progress, picks, switching, unknown state and disconnect", async () => {
  await mkdir("test-results", { recursive: true })
  const profile = await mkdtemp(path.resolve("test-results/profile-"))
  const environment = { ...process.env, LOL_TRACKER_USER_DATA: profile }
  delete environment.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({
    ...(process.env.TRACKER_TEST_EXE
      ? { executablePath: process.env.TRACKER_TEST_EXE, args: [] }
      : { args: ["."] }),
    env: environment,
  })
  try {
    const page = await app.firstWindow()
    const pageErrors: string[] = []
    page.on("pageerror", (error) => pageErrors.push(error.message))
    await expect(page.getByRole("button", { name: "世界旅行", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "世界旅行", exact: true }).click()
    await expect(page.locator(".challenge-list button")).toHaveCount(13)
    await expect(page.locator(".progress-row")).toContainText("進捗未取得")
    await expect(page.locator(".progress-row")).not.toContainText("最高段階に到達")
    const champions = [
      { id: 1, alias: "Annie", name: "Annie", roles: ["mage"] },
      { id: 2, alias: "Olaf", name: "Olaf", roles: ["fighter", "mage"] },
      { id: 3, alias: "Galio", name: "Galio", roles: ["tank", "mage"] },
      { id: 4, alias: "TwistedFate", name: "Twisted Fate", roles: ["mage"] },
      { id: 5, alias: "XinZhao", name: "Xin Zhao", roles: ["fighter", "mage"] },
    ].map((champion) => ({ ...champion, isVisibleInClient: true }))
    // Deliberately synthetic data: class assignments / eligibility are not live LoL data.
    const challenges: Record<string, unknown> = {}
    for (const id of [
      ...Array.from({ length: 13 }, (_, i) => 303501 + i),
      ...Array.from({ length: 12 }, (_, i) => 303401 + i),
    ])
      challenges[id] = {
        currentValue: id === 303401 ? 8 : 0,
        currentLevel: id === 303401 ? "MASTER" : "NONE",
        thresholds: {
          GOLD: { value: 1 },
          MASTER: { value: 8 },
          GRANDMASTER: { value: 10 },
          CHALLENGER: { value: 15 },
        },
        availableIds: id === 303402 ? [4, 5] : [1, 2, 3, 4, 5],
      }
    challenges[303400] = {
      currentValue: 100,
      currentLevel: "GOLD",
      thresholds: { GOLD: { value: 100 }, MASTER: { value: 250 } },
    }
    challenges[210001] = {
      name: "S+ テスト",
      description: "Synthetic champion completion",
      completedIds: [1],
    }
    await page.route("https://127.0.0.1:54321/**", (route) => {
      const url = route.request().url()
      const data = url.includes("current-summoner")
        ? { summonerId: 123, puuid: "test-player" }
        : url.includes("champions-minimal")
          ? champions
          : challenges
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data),
      })
    })
    const send = async (channel: string, payload: unknown) =>
      app.evaluate(
        ({ BrowserWindow }, { channel, payload }) =>
          BrowserWindow.getAllWindows()[0].webContents.send(channel, payload),
        { channel, payload },
      )
    await send("credentials", {
      address: "127.0.0.1",
      port: 54321,
      username: "synthetic",
      password: "synthetic",
      protocol: "https",
    })
    await send("picks-connected", true)
    await expect(page.locator(".progress-row")).toContainText("0 勝")
    await page.getByRole("button", { name: "調和", exact: true }).click()
    await expect(page.locator(".challenge-list button")).toHaveCount(12)
    await expect(page.locator(".progress-row")).toContainText("グランドマスターまで あと2勝")
    await expect(page.locator(".parent-progress")).toContainText("100 ポイント")
    await send("team-picks", [1, 2, 3, 0, 0])
    await send("pick", 1)
    await expect(page.locator(".composition-heading")).toContainText("構成選択中")
    await expect(page.locator(".composition")).toContainText("選択済み 3 / 5")
    await send("team-picks", [1, 2, 3, 4, 5])
    await expect(page.locator(".composition-heading")).toContainText("構成条件を満たす")
    await expect(page.locator(".own-pick")).toContainText("アニー ／ 対象")
    await page.locator(".challenge-list button").nth(1).click()
    await expect(page.locator(".composition-heading")).toContainText("構成条件を満たしていません")
    await expect(page.locator(".own-pick")).toContainText("対象外")
    await page.getByRole("button", { name: /一つの信念/ }).click()
    await expect(page.locator(".composition-heading")).toContainText("構成未判定")
    await page.getByLabel("判定するクラス").selectOption("mage")
    await expect(page.locator(".composition-heading")).toContainText("構成条件を満たす")
    await page.getByRole("searchbox").fill("アニー")
    await expect(page.locator(".eligible-champion")).toHaveCount(1)
    await page.getByRole("searchbox").fill("")
    await page.screenshot({ path: "test-results/harmony-synthetic.png", fullPage: true })
    await send("team-picks", [1, 2, 3, 4, 999])
    await expect(page.locator(".composition-heading")).toContainText("構成未判定")
    await page.getByRole("button", { name: "チャンプ別", exact: true }).click()
    await expect(page.getByRole("heading", { level: 1 })).toContainText("S+ テスト (1 / 5)")
    await expect(page.locator(".selected-champ-done-label")).toContainText("Done")
    await send("credentials", null)
    await page.getByRole("button", { name: "世界旅行", exact: true }).click()
    await expect(page.locator(".progress-row")).toContainText("進捗未取得")
    await expect(page.locator(".composition-heading")).toContainText("チャンピオン選択待ち")
    await expect(page.locator(".own-pick")).toContainText("未選択")
    await page.screenshot({ path: "test-results/globetrotter-offline.png", fullPage: true })
    expect(pageErrors).toEqual([])
  } finally {
    await app.close()
  }
})
