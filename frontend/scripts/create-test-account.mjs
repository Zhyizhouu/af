import puppeteer from 'puppeteer-core';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const CHROME_PATH = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE_URL = process.env.AF_BASE_URL || 'http://localhost:5173';
const CREDENTIALS_PATH = process.env.AF_TEST_CREDENTIALS || 'C:/Users/rflxv/.secret/af-redesign-test.json';
const TEST_EMAIL = 'af-redesign-test@example.com';

function generatePassword() {
  return randomBytes(18).toString('base64url').slice(0, 24);
}

async function fileExists(path) {
  try {
    const { access } = await import('node:fs/promises');
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (await fileExists(CREDENTIALS_PATH)) {
    console.error(`Credentials file already exists at ${CREDENTIALS_PATH}. Refusing to create another account.`);
    process.exit(1);
  }

  const password = generatePassword();

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 960 });
    await page.goto(BASE_URL, { waitUntil: 'load' });

    const createAccountButton = await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).find((el) => el.textContent?.trim() === 'Create an account'),
      { timeout: 15000 },
    );
    await createAccountButton.asElement().click();

    await page.waitForSelector('#signin-email', { timeout: 15000 });
    await page.type('#signin-email', TEST_EMAIL);
    await page.type('#signin-password', password);

    const submitHandle = await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button[type="submit"], button')).find((el) => el.textContent?.trim() === 'Create account'),
      { timeout: 15000 },
    );
    await submitHandle.asElement().click();

    await page.waitForFunction(
      () => document.querySelector('.af-shell') !== null,
      { timeout: 20000 },
    );

    await mkdir(dirname(CREDENTIALS_PATH), { recursive: true });
    await writeFile(CREDENTIALS_PATH, JSON.stringify({ email: TEST_EMAIL, password }), 'utf8');
    console.log(`Account created and credentials written to ${CREDENTIALS_PATH}`);
  } catch (err) {
    console.error('Failed to create test account:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
