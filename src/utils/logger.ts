import { createLogger, format, transports } from 'winston';

const { combine, timestamp, printf, colorize } = format;

/**
 * Custom log format: [timestamp] [level]: message
 */
const logFormat = printf(({ level, message, timestamp: ts }) => {
  return `${ts} [${level}]: ${message}`;
});

/**
 * Winston logger instance.
 * - Console transport with colorized output for development
 * - File transports for error and combined logs
 */
export const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat,
  ),
  transports: [
    new transports.Console({
      format: combine(colorize(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
    }),
  ],
});

/**
 * Stream object for morgan integration (if needed).
 */
export const loggerStream = {
  write: (message: string): void => {
    logger.info(message.trim());
  },
};
