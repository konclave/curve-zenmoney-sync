import { loadConfig } from "../config";
import { buildApp } from "./app";
import { logger } from "../logging/logger";

const config = loadConfig();
const app = buildApp(config);

app.listen({ port: config.port, host: "0.0.0.0" }, (err) => {
  if (err) {
    logger.fatal({ event: "server.start_failed", err }, "Failed to start server");
    process.exit(1);
  }
  logger.info({ event: "server.started", port: config.port, host: "0.0.0.0" }, "Server listening");
});
