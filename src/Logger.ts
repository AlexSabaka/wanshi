import * as fs from "fs";

// Logging utility
export class Logger {
  private logLevel: string;
  private logFile?: string;
  private silent: boolean;

  constructor(
    logLevel: string = "info",
    logFile?: string,
    silent: boolean = false
  ) {
    this.logLevel = logLevel;
    this.logFile = logFile;
    this.silent = silent;
  }

  private shouldLog(level: string): boolean {
    const levels = ["error", "warn", "info", "debug"];
    return levels.indexOf(level) <= levels.indexOf(this.logLevel);
  }

  private log(level: string, message: string): void {
    if (!this.shouldLog(level) || this.silent) return;

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;

    console.log(logMessage);

    if (this.logFile) {
      fs.appendFileSync(this.logFile, logMessage + "\n");
    }
  }

  error(message: string): void {
    this.log("error", message);
  }
  warn(message: string): void {
    this.log("warn", message);
  }
  info(message: string): void {
    this.log("info", message);
  }
  debug(message: string): void {
    this.log("debug", message);
  }
}
