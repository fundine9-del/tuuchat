import { chromium } from 'playwright-core'

const WEB = 'http://localhost:5173'
const API = 'http://localhost:3000'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

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

async function main() {
  const suffix = Date.now().toString(36)
  const uA = `browser_${suffix}`
  const uB = `peer_${suffix}`

  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[console.error]', m.text())
  })
  page.on('response', (r) => {
    if (r.status() >= 400) console.log('[http]', r.status(), r.url())
  })
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))

  /* --- signup flow --- */
  await page.goto(`${WEB}/signup`)
  await page.getByText('Create your account').waitFor()
  await page.getByPlaceholder('Jane Doe').fill('Browser Tester')
  await page.getByPlaceholder('janedoe').fill(uA)
  await page.getByPlaceholder('you@example.com').fill(`${uA}@test.dev`)
  await page.getByPlaceholder('At least 6 characters').fill('password1')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL(`${WEB}/`)
  await page.getByText('Your messages live here').waitFor()
  console.log('OK signup -> home')

  /* --- set up peer + conversation via API, using A's token --- */
  const tokenA = await page.evaluate(() => localStorage.getItem('tuuchat:token'))
  assert(tokenA, 'token stored')
  const b = await api('/api/auth/register', { body: { email: `${uB}@test.dev`, username: uB, password: 'password1', display_name: 'Peer Person' } })
  const conv = await api('/api/conversations', { token: tokenA!, body: { type: 'direct', user_ids: [b.user.id] } })
  await api(`/api/conversations/${conv.conversation.id}/messages`, {
    token: tokenA!,
    body: { content: 'hello from rest!' },
  })

  await page.reload()
  await page.getByText('Peer Person').waitFor()
  await page.getByText('hello from rest!').waitFor()
  console.log('OK conversation + preview in list')

  /* --- open chat, send message over the UI --- */
  await page.getByText('Peer Person').click()
  await page.waitForURL(`${WEB}/chat/*`)
  const composer = page.getByPlaceholder('Type a message…')
  try {
    await composer.waitFor({ timeout: 10000 })
  } catch {
    console.error('composer missing. url=', page.url())
    console.log('HTML:', (await page.content()).slice(0, 3000))
    await page.screenshot({ path: 'e2e-fail.png' })
    throw new Error('composer not rendered')
  }
  await page.getByText('hello from rest!', { exact: true }).last().waitFor()
  await composer.fill('web ui message')
  const sendResp = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/conversations\/[^/]+\/messages$/.test(r.url()),
  )
  await composer.press('Enter')
  await page.getByText('web ui message', { exact: true }).last().waitFor()
  await sendResp // ensure the message reached the server before navigating/reloading
  console.log('OK chat opened + message sent via UI')

  /* --- reload keeps messages --- */
  await page.reload()
  await page.getByText('web ui message', { exact: true }).last().waitFor()
  console.log('OK messages persisted')

  /* --- edit message over the UI --- */
  const bubbleRow = page
    .getByText('web ui message', { exact: true })
    .last()
    .locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " group ")]')
  await bubbleRow.hover()
  await bubbleRow.getByTitle('Edit').click()
  const editBox = page.locator('textarea[placeholder="Edit message"]')
  await editBox.fill('edited via UI')
  await editBox.press('Enter')
  await page.getByText('edited via UI', { exact: true }).last().waitFor()
  await page.getByText('(edited)').waitFor()
  console.log('OK message edited')

  /* --- delete message over the UI --- */
  page.on('dialog', (d) => d.accept())
  const editedRow = page
    .getByText('edited via UI', { exact: true })
    .last()
    .locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " group ")]')
  await editedRow.hover()
  await editedRow.getByTitle('Delete').click()
  await page.getByText('edited via UI', { exact: true }).last().waitFor({ state: 'hidden' })
  console.log('OK message deleted')

  /* --- profile flow --- */
  await page.goto(`${WEB}/profile`)
  await page.getByRole('heading', { name: 'Profile' }).waitFor()
  const nameInput = page.getByPlaceholder('Tell people about yourself…')
  await nameInput.fill('E2E bio here')
  const displayInput = page.locator('main form input')
  await displayInput.fill('Renamed Tester')
  await page.getByRole('button', { name: /Save changes/ }).click()
  await page.getByText('Profile saved').waitFor()
  console.log('OK profile save')

  /* --- verify sidebar shows updated name --- */
  const persistedUser = await page.evaluate(() => JSON.parse(localStorage.getItem('tuuchat:user') ?? '{}'))
  console.log('stored display_name =', persistedUser.display_name, '| username =', persistedUser.username)
  assert(persistedUser.display_name === 'Renamed Tester', `display_name persisted (got ${persistedUser.display_name})`)
  console.log('OK profile changes persisted ->', persistedUser.display_name)

  /* --- realtime: peer's sidebar updates live, no reloads --- */
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const pageB = await ctx2.newPage()
  await pageB.goto(`${WEB}/login`)
  await pageB.getByPlaceholder('you@example.com').fill(`${uB}@test.dev`)
  await pageB.getByPlaceholder('••••••••').fill('password1')
  await pageB.getByRole('button', { name: /sign in/i }).click()
  await pageB.waitForURL(`${WEB}/`)
  await pageB.getByText('Renamed Tester').waitFor()
  await pageB.waitForTimeout(1500) // let the socket connect
  assert(pageB.url() === `${WEB}/`, 'B is on home, no navigation')

  // A sends a message -> B's sidebar preview updates in place
  await api(`/api/conversations/${conv.conversation.id}/messages`, {
    token: tokenA!,
    body: { content: 'live from A' },
  })
  await pageB.getByText('live from A').waitFor({ timeout: 10000 })
  assert(pageB.url() === `${WEB}/`, 'B still on home after live message update')
  console.log('OK realtime message updates peer sidebar')

  // A creates a brand-new group with B -> group appears in B's sidebar live
  const groupName = `grp-${suffix}`
  const group = await api('/api/conversations', { token: tokenA!, body: { type: 'group', name: groupName, user_ids: [b.user.id] } })
  const groupId = group?.conversation ? String(group.conversation.id) : undefined
  await api(`/api/conversations/${groupId}/messages`, { token: tokenA!, body: { content: 'welcome to the group' } })
  await pageB.getByText(groupName).waitFor({ timeout: 10000 })
  console.log('OK realtime new group appears in peer sidebar')

  await browser.close()
  console.log('E2E PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})