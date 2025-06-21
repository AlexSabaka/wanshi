import { appendFileSync } from "fs";
import { Logger as TSLogger } from "tslog";
import { ProcessingOptions } from "../../types";
import { Logger } from "./Logger";

export class LoggerFactory {
  static createLogger(
    options: Pick<
      ProcessingOptions,
      "logFile" | "logLevel" | "silent" | "debug"
    >
  ): Logger {
    const { logFile, logLevel, silent, debug } = options;

    const logger = new TSLogger<any>({
      name: "kg-gen",
      minLevel: silent
        ? 4
        : debug
        ? 0
        : logLevel === "debug"
        ? 0
        : logLevel === "info"
        ? 1
        : logLevel === "warning"
        ? 2
        : logLevel === "error"
        ? 3
        : 4,
    });

    if (logFile) {
      logger.attachTransport((logObj) => {
        appendFileSync(logFile, JSON.stringify(logObj) + "\n");
      });
    }

    return logger as Logger;
  }
}
