import puppeteer from 'puppeteer-core';
import { mkdir, readFile } from 'node:fs/promises';

const CHROME_PATH = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CREDENTIALS_PATH = process.env.AF_TEST_CREDENTIALS || 'C:/Users/rflxv/.secret/af-redesign-test.json';

const ALL_SLUGS = ['dashboard', 'checklists', 'calendar', 'habits', 'tasks', 'audio', 'ai', 'qr'];

const VIEWPORTS = [
  { width: 1440, height: 960, isMobile: false, hasTouch: false },
  { width: 400, height: 860, isMobile: true, hasTouch: true },
];

function parseArgs(argv) {
  const args = { url: 'http://localhost:5173', out: null, only: null, full: false, intro: false, concept: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url') {
      args.url = argv[++i];
    } else if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--only') {
      args.only = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--full') {
      args.full = true;
    } else if (arg === '--intro') {
      args.intro = true;
    } else if (arg === '--concept') {
      args.concept = argv[++i];
    }
  }
  return args;
}

const INTRO_FRAME_DELAYS = [300, 900, 1250, 1600, 2400];

async function loadCredentials() {
  const raw = await readFile(CREDENTIALS_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.email || !parsed.password) {
    throw new Error('Credentials file is missing email or password.');
  }
  return parsed;
}

async function settle(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilReady(page, timeout) {
  try {
    await page.waitForFunction(
      () =>
        !document.body.innerText.includes('Checking your session') &&
        !document.querySelector('#signin-email'),
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.out) {
    console.error('Missing required --out <folder>');
    process.exit(1);
  }
  const slugs = args.only && args.only.length > 0 ? args.only : ALL_SLUGS;
  const query = args.concept ? `?concept=${encodeURIComponent(args.concept)}` : '';

  await mkdir(args.out, { recursive: true });

  const { email, password } = await loadCredentials();

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  try {
    const page = await browser.newPage();

    if (!args.intro) {
      await page.evaluateOnNewDocument(() => {
        try {
          localStorage.setItem('af.intro.seen', '1');
        } catch {}
      });
    }

    for (const viewport of VIEWPORTS) {
      await page.setViewport(viewport);
      await page.goto(`${args.url}/${query}`, { waitUntil: 'load' });
      await settle(1500);
      const landingPath = `${args.out}/landing-${viewport.width}.png`;
      await page.screenshot({ path: landingPath, fullPage: args.full });
      console.log(`wrote ${landingPath}`);
    }

    for (const viewport of VIEWPORTS) {
      await page.setViewport(viewport);
      await page.goto(`${args.url}/signin${query}`, { waitUntil: 'load' });
      await settle(1500);
      const signinPath = `${args.out}/signin-${viewport.width}.png`;
      await page.screenshot({ path: signinPath, fullPage: args.full });
      console.log(`wrote ${signinPath}`);
    }

    await page.setViewport(VIEWPORTS[0]);
    await page.goto(`${args.url}/signin${query}`, { waitUntil: 'load' });
    await page.waitForSelector('#signin-email', { timeout: 15000 });
    await page.type('#signin-email', email);
    await page.type('#signin-password', password);

    const submitHandle = await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button[type="submit"], button')).find((el) => el.textContent?.trim() === 'Sign in'),
      { timeout: 15000 },
    );
    await submitHandle.asElement().click();

    const signedIn = await waitUntilReady(page, 20000);
    if (!signedIn) {
      console.error('Sign-in failed: still on the sign-in screen after submitting credentials.');
      process.exit(1);
    }

    if (args.intro) {
      for (const viewport of VIEWPORTS) {
        await page.setViewport(viewport);
        await page.evaluate(() => {
          try {
            localStorage.removeItem('af.intro.seen');
          } catch {}
        });
        const navStart = Date.now();
        await page.goto(`${args.url}/dashboard${query}`, { waitUntil: 'load' });
        await waitUntilReady(page, 20000);
        for (const delay of INTRO_FRAME_DELAYS) {
          const remaining = delay - (Date.now() - navStart);
          if (remaining > 0) await settle(remaining);
          const framePath = `${args.out}/intro-${delay}-${viewport.width}.png`;
          await page.screenshot({ path: framePath, fullPage: args.full });
          console.log(`wrote ${framePath}`);
        }
      }
      return;
    }

    for (const slug of slugs) {
      for (const viewport of VIEWPORTS) {
        await page.setViewport(viewport);
        await page.goto(`${args.url}/${slug}${query}`, { waitUntil: 'load' });
        const ready = await waitUntilReady(page, 20000);
        await settle(800);
        const suffix = ready ? '' : '-TIMEOUT';
        const shotPath = `${args.out}/${slug}-${viewport.width}${suffix}.png`;
        await page.screenshot({ path: shotPath, fullPage: args.full });
        console.log(`wrote ${shotPath}`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('look.mjs failed:', err.message);
  process.exit(1);
});
