const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assertConfigured,
  blocked,
  checkOnce,
  formatSummary,
  formatTimestamp,
  getTheaterShows,
  main,
  publishNotification,
  readConfig,
  showtimeMinutes,
} = require("../bot");
const { sendTestNotification } = require("../test-ntfy");

const configured = {
  url: "https://example.com/showtimes",
  intervalMinutes: 10,
  server: "https://ntfy.example",
  topic: "long-random-topic",
  browserHeadless: false,
};

test("readConfig normalizes environment values", () => {
  assert.deepEqual(readConfig({
    BOOKMYSHOW_URL: " https://example.com/movie ",
    CHECK_INTERVAL_MINUTES: "5",
    NTFY_SERVER: "https://ntfy.example///",
    NTFY_TOPIC: " topic-name ",
    BROWSER_HEADLESS: "YES",
  }), {
    url: "https://example.com/movie",
    intervalMinutes: 5,
    server: "https://ntfy.example",
    topic: "topic-name",
    browserHeadless: true,
  });
  assert.throws(
    () => readConfig({ CHECK_INTERVAL_MINUTES: "0" }),
    /positive integer/,
  );
});

test("assertConfigured rejects missing and placeholder topics", () => {
  assert.throws(() => assertConfigured({ topic: "" }), /Set NTFY_TOPIC/);
  assert.throws(
    () => assertConfigured({ topic: "replace-with-your-topic" }),
    /Set NTFY_TOPIC/,
  );
  assert.doesNotThrow(() => assertConfigured(configured));
});

test("publishNotification sends the expected ntfy request", async () => {
  let request;
  const response = { ok: true, status: 200 };
  const result = await publishNotification({
    message: "Test message",
    title: "Test title",
    tags: "movie_camera",
    click: configured.url,
    config: configured,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response;
    },
  });

  assert.equal(result, response);
  assert.equal(request.url, "https://ntfy.example/long-random-topic");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.body.toString("utf8"), "Test message");
  assert.deepEqual(request.options.headers, {
    Title: "Test title",
    Priority: "5",
    Tags: "movie_camera",
    Click: configured.url,
  });
  assert.ok(request.options.signal instanceof AbortSignal);
});

test("publishNotification reports non-success responses", async () => {
  await assert.rejects(
    publishNotification({
      message: "Test",
      title: "Test",
      tags: "test",
      config: configured,
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }),
    /HTTP 503/,
  );
});

test("blocked detects title and body Cloudflare indicators", async () => {
  assert.equal(await blocked({
    title: async () => "Attention Required! | Cloudflare",
  }), true);

  assert.equal(await blocked({
    title: async () => "BookMyShow",
    locator: () => ({ innerText: async () => "Cloudflare Ray ID: abc" }),
  }), true);

  assert.equal(await blocked({
    title: async () => "BookMyShow",
    locator: () => ({ innerText: async () => "Available shows" }),
  }), false);
});

test("blocked treats an unreadable body as not blocked", async () => {
  assert.equal(await blocked({
    title: async () => "BookMyShow",
    locator: () => ({ innerText: async () => { throw new Error("detached"); } }),
  }), false);
});

test("showtimeMinutes handles AM, PM, and the cutoff boundary", () => {
  assert.equal(showtimeMinutes("12:00 AM"), 0);
  assert.equal(showtimeMinutes("9:59 am"), 599);
  assert.equal(showtimeMinutes("10:00 AM"), 600);
  assert.equal(showtimeMinutes("12:00 PM"), 720);
  assert.throws(() => showtimeMinutes("25:00"), /Invalid showtime/);
});

test("getTheaterShows keeps only shows before 10 AM", async () => {
  const page = {
    evaluate: async () => [
      { theater: "Cinema One", shows: ["9:59 AM", "10:00 AM", "12:00 PM"] },
      { theater: "Cinema Two", shows: [] },
    ],
  };

  assert.deepEqual(await getTheaterShows(page), [
    { theater: "Cinema One", shows: ["9:59 AM"] },
    { theater: "Cinema Two", shows: [] },
  ]);
});

test("formatTimestamp uses the original local timestamp format", () => {
  assert.equal(
    formatTimestamp(new Date(2026, 8, 21, 7, 8, 9)),
    "2026-09-21 07:08:09",
  );
});

test("formatSummary includes theaters, empty show lists, and the URL", () => {
  const summary = formatSummary([
    { theater: "Cinema One", shows: ["9:30 AM"] },
    { theater: "Cinema Two", shows: [] },
  ], configured.url, new Date(2026, 8, 21, 7, 8, 9));

  assert.match(summary, /Shows before 10:00 AM/);
  assert.match(summary, /2026-09-21 07:08:09/);
  assert.match(summary, /Cinema One: 9:30 AM/);
  assert.match(summary, /Cinema Two: None/);
  assert.ok(summary.endsWith(configured.url));

  assert.match(
    formatSummary([], configured.url),
    /No theaters found on the BookMyShow page/,
  );
});

test("checkOnce visits, extracts, and always closes the page", async () => {
  const calls = [];
  let evaluation = 0;
  const page = {
    title: async () => "BookMyShow",
    locator: () => ({ innerText: async () => "Available shows" }),
    goto: async (url, options) => calls.push(["goto", url, options]),
    waitForTimeout: async (milliseconds) => calls.push(["wait", milliseconds]),
    evaluate: async () => {
      evaluation += 1;
      return evaluation === 1
        ? undefined
        : [{ theater: "Cinema One", shows: ["9:30 AM", "10:30 AM"] }];
    },
    close: async () => calls.push(["close"]),
  };
  const browser = { newPage: async () => page };
  const logger = { log: () => {} };

  const summary = await checkOnce(browser, configured, logger);

  assert.match(summary, /Cinema One: 9:30 AM/);
  assert.deepEqual(calls[0], ["goto", configured.url, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  }]);
  assert.deepEqual(calls.filter(([name]) => name === "wait"), [
    ["wait", 3_000],
    ["wait", 1_000],
  ]);
  assert.deepEqual(calls.at(-1), ["close"]);
});

test("main launches, publishes, waits between checks, and closes", async () => {
  const calls = [];
  const browser = { close: async () => calls.push("close") };
  const chromiumApi = {
    launch: async (options) => {
      calls.push(["launch", options]);
      return browser;
    },
  };
  const logger = { log: () => {}, error: () => {} };

  await main({
    config: configured,
    chromiumApi,
    logger,
    check: async () => "summary",
    publish: async (notification) => calls.push(["publish", notification]),
    wait: async (milliseconds) => calls.push(["wait", milliseconds]),
    maxIterations: 2,
  });

  assert.deepEqual(calls[0], ["launch", { headless: false }]);
  assert.equal(calls.filter((call) => Array.isArray(call) && call[0] === "publish").length, 2);
  assert.deepEqual(calls.find((call) => Array.isArray(call) && call[0] === "wait"), [
    "wait",
    600_000,
  ]);
  assert.equal(calls.at(-1), "close");
});

test("sendTestNotification publishes the phone smoke-test payload", async () => {
  let notification;
  let logArguments;
  const response = { status: 200 };

  const result = await sendTestNotification({
    config: configured,
    publish: async (value) => {
      notification = value;
      return response;
    },
    logger: { log: (...values) => { logArguments = values; } },
  });

  assert.equal(result, response);
  assert.equal(notification.title, "BookMyShow Beep Test");
  assert.equal(notification.tags, "rotating_light,movie_camera");
  assert.match(notification.message, /phone alert is working/);
  assert.deepEqual(logArguments, ["Test notification sent. HTTP", 200]);
});