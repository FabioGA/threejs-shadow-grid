import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8123/examples/demo.html";
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const messages = [];
page.on("console", (msg) => messages.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => messages.push(`[pageerror] ${err.message}`));

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

// Move the mouse to a corner, screenshot, then the opposite corner, screenshot again,
// to visually confirm the shadow actually shifts with pointer position.
await page.mouse.move(200, 200);
await page.waitForTimeout(600);
await page.screenshot({ path: "/root/threejs-shadow-grid/scripts/out-mouse-topleft.png" });

await page.mouse.move(1100, 700);
await page.waitForTimeout(600);
await page.screenshot({ path: "/root/threejs-shadow-grid/scripts/out-mouse-bottomright.png" });

// Scroll down to confirm the fixed full-bleed background stays put and full-bleed,
// and that the contained box demo (with its own independent grid) also renders.
await page.evaluate(() => window.scrollTo(0, 900));
await page.waitForTimeout(400);
await page.screenshot({ path: "/root/threejs-shadow-grid/scripts/out-scrolled.png" });

// Resize to check the grid re-fills the new viewport size (auto-fill by cell size).
await page.setViewportSize({ width: 700, height: 1000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "/root/threejs-shadow-grid/scripts/out-resized-narrow.png", fullPage: false });

const canvasCount = await page.evaluate(() => document.querySelectorAll("canvas").length);
const bgSize = await page.evaluate(() => {
  const c = document.querySelector("#bg canvas");
  return c ? { width: c.width, height: c.height, cssW: c.clientWidth, cssH: c.clientHeight } : null;
});

console.log("CANVAS_COUNT", canvasCount);
console.log("BG_CANVAS_SIZE", JSON.stringify(bgSize));
console.log("---CONSOLE MESSAGES---");
messages.forEach((m) => console.log(m));

await browser.close();
