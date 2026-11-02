export interface LogFields {
  msg: string;
  [key: string]: unknown;
}

function format(level: string, fields: LogFields): string {
  return JSON.stringify({
    level,
    time: new Date().toISOString(),
    ...fields,
  });
}

export const logger = {
  info(fields: LogFields): void {
    console.info(format('info', fields));
  },
  warn(fields: LogFields): void {
    console.warn(format('warn', fields));
  },
  error(fields: LogFields): void {
    console.error(format('error', fields));
  },
};
