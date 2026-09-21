const path = require("node:path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const { chromium } = require("playwright");

const DEFAULT_URL = "https://in.bookmyshow.com/movies/warangal/the-paradise/ET00436621";
// https://in.bookmyshow.com/movies/warangal/the-paradise/ET00436621
// https://in.bookmyshow.com/movies/warangal/the-paradise/buytickets/ET00436621/20260924?etCodes=ET00436621&language=telugu&refEventCode=ET00436621

function readConfig(env = process.env) {
  const intervalMinutes = Number(env.CHECK_INTERVAL_MINUTES ?? "10");
  if (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0) {
    throw new Error("CHECK_INTERVAL_MINUTES must be a positive integer");
  }

  return {
    url: (env.BOOKMYSHOW_URL ?? DEFAULT_URL).trim(),
    intervalMinutes,
    checkMethod: (env.CHECK_METHOD ?? "book_tickets").trim().toLowerCase(),
    targetDate: (env.CHECK_SHOW_DATE ?? "").trim(),
    server: (env.NTFY_SERVER ?? "https://ntfy.sh").trim().replace(/\/+$/, ""),
    topic: (env.NTFY_TOPIC ?? "").trim(),
    browserHeadless: ["1", "true", "yes", "on"].includes(
      (env.BROWSER_HEADLESS ?? "false").trim().toLowerCase(),
    ),
  };
}

function assertConfigured(config) {
  if (!config.topic || config.topic.startsWith("replace-with")) {
    throw new Error("Set NTFY_TOPIC in .env");
  }
  if (!Object.hasOwn(CHECK_METHODS, config.checkMethod)) {
    throw new Error(
      `CHECK_METHOD must be one of: ${Object.keys(CHECK_METHODS).join(", ")}`,
    );
  }
  if (config.checkMethod === "check_show" && !/^\d{8}$/.test(config.targetDate)) {
    throw new Error("CHECK_SHOW_DATE must use YYYYMMDD format for check_show");
  }
}

async function publishNotification({
  message,
  title,
  tags,
  click,
  config = readConfig(),
  fetchImpl = globalThis.fetch,
}) {
  assertConfigured(config);
  const headers = {
    Title: title,
    Priority: "5",
    Tags: tags,
  };
  if (click) {
    headers.Click = click;
  }

  const response = await fetchImpl(`${config.server}/${config.topic}`, {
    method: "POST",
    body: Buffer.from(message, "utf8"),
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`ntfy request failed with HTTP ${response.status}`);
  }
  return response;
}

async function blocked(page) {
  if ((await page.title()).includes("Attention Required")) {
    return true;
  }

  try {
    const body = await page.locator("body").innerText({ timeout: 5_000 });
    return body.includes("You are unable to access bookmyshow.com")
      || body.includes("Cloudflare Ray ID");
  } catch {
    return false;
  }
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function checkBookTickets(page, { url }) {
  const bookTickets = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && bounds.width > 0
        && bounds.height > 0;
    };

    return [...document.querySelectorAll("button,a,[role='button']")]
      .filter(visible)
      .map((element) => ({
        text: (element.innerText || element.textContent || "")
          .trim()
          .replace(/\s+/g, " "),
        aria: element.getAttribute("aria-label") || "",
        disabled: element.hasAttribute("disabled")
          || element.getAttribute("aria-disabled") === "true",
      }))
      .filter(
        (control) => /book\s*tickets/i.test(`${control.text} ${control.aria}`)
          && !control.disabled,
      );
  });

  if (bookTickets.length === 0) {
    return null;
  }

  return {
    title: "BookMyShow Tickets Available",
    tags: "ticket,movie_camera",
    message: `Book tickets are available now.\n\n${url}`,
  };
}

async function checkShow(page, { url, targetDate }) {
  const showDate = await page.evaluate((date) => {
    const dateElement = document.getElementById(date);
    if (!dateElement) {
      return null;
    }

    const style = getComputedStyle(dateElement);
    const bounds = dateElement.getBoundingClientRect();
    if (
      style.display === "none"
      || style.visibility === "hidden"
      || bounds.width === 0
      || bounds.height === 0
    ) {
      return null;
    }

    const labels = [...dateElement.children]
      .map((element) => (element.textContent || "").trim())
      .filter(Boolean);

    return {
      weekday: labels[0] || "",
      day: labels[1] || "",
      month: labels[2] || "",
    };
  }, targetDate);

  if (!showDate) {
    return null;
  }

  const label = [showDate.weekday, showDate.day, showDate.month]
    .filter(Boolean)
    .join(" ");
  return {
    title: "BookMyShow Show Date Available",
    tags: "calendar,movie_camera",
    message: `The show date ${label || targetDate} is available.\n\n${url}`,
  };
}

const CHECK_METHODS = Object.freeze({
  book_tickets: checkBookTickets,
  check_show: checkShow,
});

async function checkOnce(browser, config, logger = console) {
  const page = await browser.newPage();
  try {
    logger.log(
      `[${formatTimestamp(new Date())}] Checking ${config.checkMethod}...`,
    );
    await page.goto(config.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(3_000);
    if (await blocked(page)) {
      throw new Error(
        "BookMyShow is showing a Cloudflare block. Keep BROWSER_HEADLESS=false, then use the opened browser window to pass any site check or try from a non-corporate network.",
      );
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.35));
    await page.waitForTimeout(1_000);
    return CHECK_METHODS[config.checkMethod](page, config);
  } finally {
    await page.close();
  }
}

async function main({
  config = readConfig(),
  chromiumApi = chromium,
  logger = console,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  check = checkOnce,
  publish = publishNotification,
  maxIterations = Number.POSITIVE_INFINITY,
} = {}) {
  assertConfigured(config);
  logger.log(
    "BookMyShow → ntfy |",
    config.checkMethod,
    "every",
    config.intervalMinutes,
    "minutes | headless",
    config.browserHeadless,
  );

  const browser = await chromiumApi.launch({ headless: config.browserHeadless });
  try {
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      try {
        const notification = await check(browser, config, logger);
        if (notification) {
          logger.log(notification.message);
          await publish({
            ...notification,
            click: config.url,
            config,
          });
          logger.log("Notification sent.");
        } else {
          logger.log("Condition not matched; notification not sent.");
        }
      } catch (error) {
        logger.error("Error:", error instanceof Error ? error.message : error);
      }
      if (iteration + 1 < maxIterations) {
        await wait(config.intervalMinutes * 60_000);
      }
    }
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = {
  CHECK_METHODS,
  DEFAULT_URL,
  assertConfigured,
  blocked,
  checkBookTickets,
  checkOnce,
  checkShow,
  formatTimestamp,
  main,
  publishNotification,
  readConfig,
};