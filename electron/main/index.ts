import { app, BrowserWindow, shell, ipcMain } from "electron"
import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { get } from "node:https"
import path from "node:path"
import os from "node:os"
import LCUConnector from "lcu-connector"
import { WebSocket } from "ws"
import Store from "electron-store"
import { LCUEvents } from "./interface.js"
import { parseTeamSession } from "./team-session.js"
import type { LCUCredentials } from "../../src/types/lcu.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, "../..")
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron")
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist")
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST
if (os.release().startsWith("6.1")) app.disableHardwareAcceleration()
if (process.platform === "win32") app.setAppUserModelId(app.getName())
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

async function createWindow() {
  const win = new BrowserWindow({
    title: "LoL Challenge Tracker",
    icon: path.join(process.env.VITE_PUBLIC, "favicon.ico"),
    autoHideMenuBar: true,
    height: 920,
    width: 1440,
    minWidth: 760,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      nodeIntegration: true,
      allowRunningInsecureContent: true,
      webSecurity: false,
    },
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) void shell.openExternal(url)
    return { action: "deny" }
  })
  if (VITE_DEV_SERVER_URL) await win.loadURL(VITE_DEV_SERVER_URL)
  else await win.loadFile(path.join(RENDERER_DIST, "index.html"))
  return win
}

function send(win: BrowserWindow, channel: string, value?: unknown) {
  if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, value)
}
function clearPicks(win: BrowserWindow) {
  send(win, "team-picks", null)
  send(win, "pick", null)
}
function sendSession(win: BrowserWindow, session: unknown) {
  const picks = parseTeamSession(session)
  send(win, "team-picks", picks.team)
  send(win, "pick", picks.own)
}

function readCurrentSession(credentials: LCUCredentials): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = get(
      {
        hostname: credentials.address,
        port: credentials.port,
        path: "/lol-champ-select/v1/session",
        auth: `${credentials.username}:${credentials.password}`,
        rejectUnauthorized: false,
        timeout: 8000,
      },
      (response) => {
        let body = ""
        response.setEncoding("utf8")
        response.on("data", (chunk) => {
          body += chunk
        })
        response.on("end", () => {
          if (response.statusCode === 404) return resolve(null)
          if (response.statusCode !== 200) return reject(new Error("Session unavailable"))
          try {
            resolve(JSON.parse(body))
          } catch {
            reject(new Error("Invalid session"))
          }
        })
        response.on("error", () => reject(new Error("Session unavailable")))
      },
    )
    request.on("timeout", () => request.destroy(new Error("Session timeout")))
    request.on("error", () => reject(new Error("Session unavailable")))
  })
}

function connectToLcu(win: BrowserWindow, clientPath: string) {
  const connector = new LCUConnector(clientPath)
  let credentials: LCUCredentials | null = null
  let socket: WebSocket | null = null
  let retry: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let revision = 0
  const stopSocket = () => {
    ++revision
    clearTimeout(retry)
    const oldSocket = socket
    socket = null
    oldSocket?.terminate()
    clearPicks(win)
    send(win, "picks-connected", false)
  }
  const connectSocket = () => {
    if (!credentials || stopped || win.isDestroyed()) return
    const currentCredentials = credentials
    const ws = new WebSocket(`wss://${credentials.address}:${credentials.port}/`, "wamp", {
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`,
      },
      rejectUnauthorized: false,
      handshakeTimeout: 8000,
    })
    socket = ws
    const current = () => socket === ws && credentials === currentCredentials && !stopped
    ws.on("open", () => {
      if (!current()) return
      for (const event of Object.values(LCUEvents)) ws.send(JSON.stringify([5, event]))
      send(win, "picks-connected", true)
      send(win, "refetch")
      const snapshotRevision = revision
      void readCurrentSession(currentCredentials)
        .then((session) => {
          if (current() && revision === snapshotRevision) sendSession(win, session)
        })
        .catch(() => {
          if (current() && revision === snapshotRevision) clearPicks(win)
        })
    })
    ws.on("message", (message) => {
      if (!current()) return
      try {
        const event = JSON.parse(message.toString())
        if (!Array.isArray(event) || event[0] !== 8 || !event[2] || typeof event[2] !== "object")
          return
        const [, type, payload] = event
        switch (type) {
          case LCUEvents.ChampSelectSession:
            ++revision
            sendSession(win, payload.eventType === "Delete" ? null : payload.data)
            break
          case LCUEvents.EndOfGameStats:
            if (payload.eventType !== "Delete") send(win, "end-of-game")
            break
          case LCUEvents.GameSession:
            if (payload.eventType === "Delete" || payload.data?.phase !== "ChampSelect") {
              ++revision
              clearPicks(win)
            }
            if (
              payload.data?.phase === "InProgress" &&
              Array.isArray(payload.data.gameData?.playerChampionSelections)
            ) {
              send(win, "game-start", payload.data.gameData.playerChampionSelections)
            }
            break
        }
      } catch {
        /* Ignore malformed events; never log credentials or message bodies. */
      }
    })
    ws.on("error", () => {
      /* close schedules the reconnect; do not emit credential-bearing errors. */
    })
    ws.on("close", () => {
      if (!current()) return
      socket = null
      ++revision
      clearPicks(win)
      send(win, "picks-connected", false)
      retry = setTimeout(connectSocket, 3000)
    })
  }
  connector.on("connect", (nextCredentials) => {
    if (stopped) return
    stopSocket()
    credentials = nextCredentials
    send(win, "credentials", credentials)
    // The endpoint can refuse early connections; the socket retries until ready.
    connectSocket()
  })
  connector.on("disconnect", () => {
    if (stopped) return
    credentials = null
    stopSocket()
    send(win, "credentials", null)
  })
  connector.start()
  return () => {
    stopped = true
    credentials = null
    stopSocket()
    connector.stop()
  }
}

function findLeagueClientPath(): Promise<string | undefined> {
  if (process.platform !== "win32") return Promise.resolve(undefined)
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-CimInstance Win32_Process -Filter \"Name = 'LeagueClientUx.exe'\" | Select-Object -First 1 -ExpandProperty CommandLine)",
      ],
      { windowsHide: true, timeout: 8000 },
      (_error, stdout) => {
        const directory = stdout?.match(/--install-directory=([^\"]+?)(?:\"|(?=\s+--|$))/)?.[1]
        resolve(directory ? path.join(directory, "LeagueClient.exe") : undefined)
      },
    )
  })
}

// Poll with CIM when launched before League, avoiding lcu-connector's obsolete WMIC discovery.
function watchForClient(win: BrowserWindow) {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let disconnect: (() => void) | undefined
  const discover = async () => {
    const clientPath = await findLeagueClientPath()
    if (stopped || win.isDestroyed()) return
    if (clientPath && LCUConnector.isValidLCUPath(path.dirname(clientPath)))
      disconnect = connectToLcu(win, clientPath)
    else timer = setTimeout(() => void discover(), 5000)
  }
  send(win, "credentials", null)
  void discover()
  return () => {
    stopped = true
    clearTimeout(timer)
    disconnect?.()
  }
}

// Optional separate profile for development / automated smoke tests.
if (process.env.LOL_TRACKER_USER_DATA) app.setPath("userData", process.env.LOL_TRACKER_USER_DATA)
const store = new Store()
async function main() {
  await app.whenReady()
  let win: BrowserWindow | undefined
  let stopWatching: (() => void) | undefined
  // Register before loadFile: renderer's app-ready may fire during navigation.
  const start = (event: Electron.IpcMainEvent) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner) return
    stopWatching?.()
    stopWatching = watchForClient(owner)
  }
  ipcMain.on("app-ready", start)
  ipcMain.on("connect-to-lcu", start)
  ipcMain.on("store-set", (_event, key, value) => store.set(key, value))
  ipcMain.handle("store-get", (_event, key: string) => store.get(key))
  win = await createWindow()
  win.on("closed", () => {
    stopWatching?.()
    stopWatching = undefined
  })
  app.on("window-all-closed", () => app.quit())
  ipcMain.on("process:close", () => app.quit())
}
// Retained from upstream for local LCU self-signed TLS; broader hardening is separate work.
app.commandLine.appendSwitch("ignore-certificate-errors")
void main()
