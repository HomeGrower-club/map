/**
 * Logger utility for debugging and performance monitoring
 */

class LoggerClass {
  private startTime: number | null = null;
  private isDevelopment: boolean = import.meta.env.DEV;

  /**
   * Start a timing operation (no longer uses console.group)
   */
  group(name: string): void {
    if (!this.isDevelopment) return;
    this.log(`▶️ ${name}`);
    this.startTime = performance.now();
  }

  /**
   * End timing and report elapsed time
   */
  groupEnd(): void {
    if (!this.isDevelopment) return;
    const elapsed = this.startTime ? (performance.now() - this.startTime).toFixed(2) : 0;
    this.log(`⏱️ Completed in ${elapsed}ms`);
  }

  /**
   * Standard log - simplified for better readability
   */
  log(message: string, data?: unknown): void {
    if (!this.isDevelopment) return;
    if (data !== undefined) {
      console.log(message, data);
    } else {
      console.log(message);
    }
  }

  /**
   * Warning log for non-critical issues
   */
  warn(message: string, data?: unknown): void {
    if (!this.isDevelopment) return;
    if (data !== undefined) {
      console.warn(`⚠️ ${message}`, data);
    } else {
      console.warn(`⚠️ ${message}`);
    }
  }

  /**
   * Info log for important production messages
   */
  info(message: string, data?: unknown): void {
    // Always log info messages, but with different formatting
    if (this.isDevelopment) {
      console.log(`ℹ️ ${message}`, data || '');
    } else {
      console.log(`[INFO] ${message}`, data || '');
    }
  }

  /**
   * Error log for critical issues
   */
  error(message: string, error: Error | unknown): void {
    // In production, use clean formatting without emojis
    if (this.isDevelopment) {
      console.error(`❌ ${message}`, error);
    } else {
      console.error(`[ERROR] ${message}`, error);
    }
  }
}

export const Logger = new LoggerClass();