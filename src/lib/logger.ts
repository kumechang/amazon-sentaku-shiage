// GitHub Actionsのログにそのまま出せる、タイムスタンプ付きの簡易ロガー。
type LogFields = Record<string, unknown>;

function line(level: string, message: string, fields?: LogFields): string {
  const suffix = fields ? ` ${JSON.stringify(fields)}` : "";
  return `[${new Date().toISOString()}] ${level} ${message}${suffix}`;
}

export const logger = {
  info(message: string, fields?: LogFields): void {
    console.log(line("INFO", message, fields));
  },
  warn(message: string, fields?: LogFields): void {
    console.warn(line("WARN", message, fields));
  },
  error(message: string, fields?: LogFields): void {
    console.error(line("ERROR", message, fields));
  },
};
