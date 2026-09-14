import { chromium, type Page } from 'playwright-core'

const WEB = process.env.WEB || 'http://localhost:5173'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function signup(page: Page, email: string, username: string) {
  await page.goto(`${WEB}/signup`)
  await page.getByPlaceholder('janedoe').fill(username)
  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByPlaceholder('At least 6 characters').fill('password123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL(`${WEB}/`, { timeout: 15000 })
}

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  })
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1280, height: 800 })

  await signup(page, `nav-${uid}@test.com`, `nav_${uid}`)

  const nav = page.getByTestId('bottom-nav')
  await nav.waitFor({ timeout: 10000 })
  console.log('OK bottom nav visible on /')

  for (const [label, path] of [
    ['Live', '/live'],
    ['Profile', '/profile'],
    ['Home', '/'],
  ] as const) {
    await nav.getByRole('button', { name: label }).click()
    await page.waitForURL(`${WEB}${path}`, { timeout: 10000 })
    console.log(`OK tab "${label}" -> ${path}`)
  }

  const navCount = await page.getByTestId('bottom-nav').count()
  console.log(`nav visible on /: count=${navCount}`)

  console.log('NAV E2E PASSED')
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})