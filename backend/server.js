import "dotenv/config";
import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json({ limit: "20kb" }));
const PORT = Number(process.env.PORT || 8787);
const API_KEY = (process.env.CHECK_API_KEY || "").trim();
const HEADLESS =
  String(process.env.HEADLESS || "false").toLowerCase() === "true";
console.log(`Starting server on port ${PORT} | HEADLESS=${HEADLESS}`);
let browserPromise;

function authorized(req) {
  return !API_KEY || req.headers.authorization === `Bearer ${API_KEY}`;
}

async function browser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: HEADLESS,
        args: [
          "--disable-dev-shm-usage",
          "--no-sandbox",
          "--disable-blink-features=AutomationControlled",
        ],
      })
      .catch((e) => {
        browserPromise = undefined;
        throw e;
      });
  }
  return browserPromise;
}

async function checkBookTickets(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const bounds = el.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        bounds.width > 0 &&
        bounds.height > 0
      );
    };
    const controls = [
      ...document.querySelectorAll("button,a,[role='button']"),
    ]
      .filter(visible)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: (el.innerText || el.textContent || "")
          .trim()
          .replace(/\s+/g, " "),
        aria: el.getAttribute("aria-label") || "",
        disabled:
          el.hasAttribute("disabled") ||
          el.getAttribute("aria-disabled") === "true",
      }))
      .filter((control) => control.text || control.aria)
      .slice(0, 300);
    const bookTickets = controls.filter(
      (control) =>
        /book\s*tickets/i.test(`${control.text} ${control.aria}`) &&
        !control.disabled,
    );

    return {
      bookTicketsVisible: bookTickets.length > 0,
      bookTickets,
    };
  });
}

async function checkShow(page, { date }) {
  return page.evaluate((targetDate) => {
    const dateElement = document.getElementById(targetDate);
    if (!dateElement) {
      return {
        targetDate,
        showDateAvailable: false,
        showDate: null,
      };
    }

    const labels = [...dateElement.children]
      .map((element) => (element.textContent || "").trim())
      .filter(Boolean);

    return {
      targetDate,
      showDateAvailable: true,
      showDate: {
        weekday: labels[0] || "",
        day: labels[1] || "",
        month: labels[2] || "",
      },
    };
  }, date);
}

const CHECK_METHODS = Object.freeze({
  book_tickets: checkBookTickets,
  check_show: checkShow,
});

async function inspect(url, method, parameters) {
  const b = await browser();
  const context = await b.newContext({
    viewport: { width: 1365, height: 900 },
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  page.on("console", async (message) => {
    
  const values = await Promise.all(
    message.args().map(async (arg) => {
      try {
        return await arg.jsonValue();
      } catch {
        return arg.toString();
      }
    }),
  );

  if(message.type() === 'log') {
    console.log("[Browser log]", ...values);
  }
});

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);
    await page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight * 0.35),
    );
    await page.waitForTimeout(1500);
    const result = await CHECK_METHODS[method](page, parameters);
    const pageDetails = await page.evaluate(() => ({
        title: document.title,
        url: location.href,
        pageText: (document.body?.innerText || "").slice(0, 12000),
    }));
    return { ...pageDetails, method, ...result };
  } finally {
    await context.close();
  }
}

app.get("/health", (_, res) =>
  res.json({ ok: true, service: "personal-alert-backend" }),
);

app.post("/check", async (req, res) => {
  const isAuthorized = authorized(req);
  const method = String(req.body?.method || "book_tickets")
    .trim()
    .toLowerCase();
  console.log("Received /check request", {
    method,
    url: req.body?.url,
    authorized: isAuthorized,
  });
  if (!isAuthorized) return res.status(401).json({ error: "Unauthorized" });
  if (!Object.hasOwn(CHECK_METHODS, method)) {
    return res.status(400).json({
      error: "Unsupported check method",
      supportedMethods: Object.keys(CHECK_METHODS),
    });
  }

  let parameters = {};
  if (method === "check_show") {
    const date = String(req.body?.date || "").trim();
    if (!/^\d{8}$/.test(date)) {
      return res.status(400).json({
        error: "date must use YYYYMMDD format for check_show",
      });
    }
    parameters = { date };
  }

  const url = String(req.body?.url || "").trim();
  let u;
  try {
    u = new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }
  if (!["http:", "https:"].includes(u.protocol))
    return res.status(400).json({ error: "Only HTTP/HTTPS URLs are allowed" });
  try {
    const started = Date.now();
    const result = await inspect(u.toString(), method, parameters);

    console.log("response ", {
      ok: true,
      checkedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      ...result,
    });

    res.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      ...result,
    });
  } catch (e) {
    console.error(e);
    res
      .status(502)
      .json({ ok: false, error: e?.message || "Browser check failed" });
  }
});

const server = app.listen(PORT, "0.0.0.0", () =>
  console.log(`Listening on http://localhost:${PORT} | HEADLESS=${HEADLESS}`),
);

async function shutdown() {
  try {
    if (browserPromise) (await browserPromise).close();
  } finally {
    server.close(() => process.exit(0));
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
