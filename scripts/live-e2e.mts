import { chromium, BrowserContext } from 'playwright-core'

const WEB = 'http://localhost:5173'
const API = 'http://localhost:3000'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

let viewer: any = null

const api = async (path: string, opts: { method?: string; body?: unknown; token?: string } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(json)}`)
  return json
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg)
}

async function signUp(page: any, username: string, display: string) {
  await page.goto(`${WEB}/signup`)
  await page.getByText('Create your account').waitFor()
  await page.getByPlaceholder('Jane Doe').fill(display)
  await page.getByPlaceholder('janedoe').fill(username)
  await page.getByPlaceholder('you@example.com').fill(`${username}@test.dev`)
  await page.getByPlaceholder('At least 6 characters').fill('password1')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL(`${WEB}/`)
  await page.getByText('Your messages live here').waitFor()
}

async function hasAttachedVideo(page: any): Promise<boolean> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('video')).some((v: any) => v && v.srcObject && v.readyState >= 2),
  )
}

async function main() {
  const suffix = Date.now().toString(36)
  const uA = `livehost_${suffix}`
  const uB = `liveview_${suffix}`
  const title = 'E2E Live ' + suffix

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  })

  const ctxHost: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const host = await ctxHost.newPage()
  const failures: string[] = []
  host.on('pageerror', (e) => failures.push(`host pageerror: ${e.message}`))
  host.on('console', (m) => { if (m.type() === 'error') failures.push(`host console: ${m.text()}`) })

  await signUp(host, uA, 'Live Tester A')
  const tokenA = await host.evaluate(() => localStorage.getItem('tuuchat:token'))
  assert(tokenA, 'host token stored')

  // viewer B created via API + conversation with A
  const b = await api('/api/auth/register', {
    body: { email: `${uB}@test.dev`, username: uB, password: 'password1', display_name: 'Viewer B' },
  })
  const conv = await api('/api/conversations', {
    token: tokenA!,
    body: { type: 'direct', user_ids: [b.user.id] },
  })
  assert(conv.conversation, 'conversation created')

  const ctxView: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  viewer = await ctxView.newPage()
  viewer.on('console', (m) => { if (m.type() === 'error') failures.push(`viewer console: ${m.text()}`) })
  viewer.on('pageerror', (e) => failures.push(`viewer pageerror: ${e.message}`))

  /* --- host goes live via the sidebar UI --- */
  await host.getByText('Go Live', { exact: true }).click()
  await host.getByText('Title (optional)').waitFor()
  await host.locator('input[placeholder="What\'s happening?"]').fill(title)
  await host.getByRole('button', { name: 'Start', exact: true }).click()
  await host.waitForURL(`${WEB}/live/*`, { timeout: 15000 })
  await host.getByText('You are LIVE').first().waitFor({ timeout: 10000 })
  console.log('OK host started a live')

  /* --- viewer sees the live in their sidebar and joins --- */
  await viewer.goto(`${WEB}/login`)
  await viewer.getByPlaceholder('you@example.com').fill(`${uB}@test.dev`)
  await viewer.getByPlaceholder('••••••••').fill('password1')
  await viewer.getByRole('button', { name: /sign in/i }).click()
  await viewer.waitForURL(`${WEB}/`, { timeout: 20000 })
  await viewer.getByText('Live Tester A').first().waitFor({ timeout: 15000 })
  await viewer.getByText('Live now').waitFor({ timeout: 15000 })
  console.log('OK viewer sees live tile')

  const viewerTile = viewer.getByRole('button').filter({ hasText: title }).first()
  await viewerTile.click()
  await viewer.waitForURL(`${WEB}/live/*`, { timeout: 15000 })
  const videoOk = await viewer.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('video')).some((v: any) => v && v.srcObject && v.readyState >= 2),
    undefined,
    { timeout: 25000 },
  )
  assert(await videoOk.jsonValue(), 'viewer has host video stream')
  console.log('OK viewer receives host video/audio stream')

  const liveId = new URL(viewer.url()).pathname.split('/').pop()

  /* --- live comments: host -> viewer --- */
  await host.getByRole('button', { name: 'Chat', exact: true }).click()
  await host.getByPlaceholder('Send a comment…').fill('Hello live viewers!')
  await host.getByRole('button', { name: 'Send comment' }).click()
  await viewer.getByText('Hello live viewers!').waitFor({ timeout: 10000 })
  console.log('OK viewer sees host comment')

  /* --- live comments: viewer -> host --- */
  await viewer.getByRole('button', { name: 'Chat', exact: true }).click()
  await viewer.getByPlaceholder('Send a comment…').fill('Hey host! 👋')
  await viewer.getByRole('button', { name: 'Send comment' }).click()
  await host.getByText('Hey host! 👋').waitFor({ timeout: 10000 })
  console.log('OK host sees viewer comment')

  /* --- comment history REST endpoint --- */
  const viewerToken = await viewer.evaluate(() => localStorage.getItem('tuuchat:token'))
  const history = await api(`/api/live/${liveId}/comments?limit=50`, { token: viewerToken! })
  const contents = (history.comments as { content: string }[]).map((c) => c.content)
  assert(
    contents.includes('Hello live viewers!') && contents.includes('Hey host! 👋'),
    `comment history has both comments (got ${JSON.stringify(contents)})`,
  )
  console.log('OK comment history REST endpoint returns both')

  /* --- double-tap like: viewer bursts a heart, both chips show the count --- */
  await viewer.locator('video').first().dblclick()
  await viewer.getByRole('button', { name: 'Like this live' }).filter({ hasText: '1' }).waitFor({ timeout: 10000 })
  await host.getByRole('button', { name: 'Like this live' }).filter({ hasText: '1' }).waitFor({ timeout: 10000 })
  console.log('OK double-tap like reaches host and viewer')

  /* --- share-link resolution: GET /api/live/:id exposes the live to anyone with the link --- */
  const liveByLink = await api(`/api/live/${liveId}`, { token: viewerToken! })
  assert(liveByLink.live?.id === liveId, `GET /api/live/:id resolves the live (${JSON.stringify(liveByLink)})`)
  assert(liveByLink.live?.likes === 1, `GET /api/live/:id reports 1 like (got ${liveByLink.live?.likes})`)
  console.log('OK share-link REST endpoint resolves the live')

  /* --- join-by-link: an unrelated user (no shared conversation) opens the share URL directly --- */
  const uC = `livelink_${suffix}`
  await api('/api/auth/register', {
    body: { email: `${uC}@test.dev`, username: uC, password: 'password1', display_name: 'Link User C' },
  })
  const ctxC: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const linkUser = await ctxC.newPage()
  linkUser.on('console', (m) => { if (m.type() === 'error') failures.push(`linkUser console: ${m.text()}`) })
  await linkUser.goto(`${WEB}/login`)
  await linkUser.getByPlaceholder('you@example.com').fill(`${uC}@test.dev`)
  await linkUser.getByPlaceholder('••••••••').fill('password1')
  await linkUser.getByRole('button', { name: /sign in/i }).click()
  await linkUser.waitForURL(`${WEB}/`, { timeout: 20000 })
  await linkUser.goto(`${WEB}/live/${liveId}`)
  await linkUser.waitForURL(`${WEB}/live/${liveId}`, { timeout: 15000 })
  const linkVideo = await linkUser.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('video')).some((v: any) => v && v.srcObject && v.readyState >= 2),
    undefined,
    { timeout: 25000 },
  )
  assert(await linkVideo.jsonValue(), 'link user receives host video (joined by URL with no shared conversation)')
  console.log('OK unrelated user joins the live via share link')
  await linkUser.getByTitle('Leave live').click()
  await linkUser.waitForURL(`${WEB}/`)

  /* --- viewer count reaches host --- */
  const countOnHost = await host
    .locator('div.rounded-full.bg-white\\/20')
    .filter({ hasText: /\d+/ })
    .count()
  assert(countOnHost >= 1, `host shows a viewer count (found ${countOnHost})`)
  console.log('OK host shows viewer count')

  /* --- viewer leaves --- */
  await viewer.getByTitle('Leave live').click()
  await viewer.waitForURL(`${WEB}/`)
  console.log('OK viewer left the live')

  /* --- host ends the live --- */
  await host.getByTitle('End live').click()
  await host.waitForURL(`${WEB}/`, { timeout: 10000 })
  await host.getByText('Your messages live here').waitFor()

  // After leaving + host ending, viewer's sidebar should no longer list the live
  await viewer.reload()
  await viewer.getByText('Live now').waitFor({ timeout: 15000 }).catch(() => {})
  const liveGone = (await viewer.getByRole('button').filter({ hasText: title }).count()) === 0
  assert(liveGone, 'live removed from viewer sidebar after end')
  console.log('OK live removed from directory after end')

  if (failures.length) {
    console.log('PAGE WARNINGS (non-fatal):')
    failures.forEach((f) => console.log('  -', f))
  }

  await ctxC.close()
  await browser.close()
  console.log('LIVE E2E PASSED')
}

main().catch(async (e) => {
  console.error(e)
  try {
    if (viewer) {
      console.log('viewer.url =', viewer.url())
      await viewer.screenshot({ path: 'live-e2e-fail.png' })
    }
  } catch {
    /* ignore */
  }
  process.exit(1)
})