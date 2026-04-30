import pino, { type DestinationStream, type Logger } from "pino";

export type AppLogger = Logger;

export function createAppLogger(destination?: DestinationStream): AppLogger {
  return pino(
    {
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        bindings: () => ({
          service: "curve-zenmoney-sync",
        }),
      },
    },
    destination,
  );
}

export const logger = createAppLogger();
