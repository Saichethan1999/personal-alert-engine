const {
  assertConfigured,
  publishNotification,
  readConfig,
} = require("./bot");

async function sendTestNotification({
  config = readConfig(),
  publish = publishNotification,
  logger = console,
} = {}) {
  assertConfigured(config);
  const response = await publish({
    message: "🔊 BookMyShow Beep test: your phone alert is working!",
    title: "BookMyShow Beep Test",
    tags: "rotating_light,movie_camera",
    config,
  });
  logger.log("Test notification sent. HTTP", response.status);
  return response;
}

if (require.main === module) {
  sendTestNotification().catch((error) => {
    console.error("Test notification failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = { sendTestNotification };