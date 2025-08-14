/**
 * Logger utility for debugging and performance monitoring
 */

class LoggerClass {
  private startTime: number | null = null;
  private isDevelopment: boolean = process.env.NODE_ENV === 'development';

  /**
   * Start a new log group with timing
   */
  group(name: string): void {
    if (!this.isDevelopment) return;
    console.group(`🔷 ${name}`);
    this.startTime = performance.now();
  }

  /**
   * End log group and report elapsed time
   */
  groupEnd(): void {
    if (!this.isDevelopment) return;
    const elapsed = this.startTime ? (performance.now() - this.startTime).toFixed(2) : 0;
    console.log(`⏱️ Time elapsed: ${elapsed}ms`);
    console.groupEnd();
  }

  /**
   * Standard log with timestamp
   */
  log(message: string, data?: unknown): void {
    if (!this.isDevelopment) return;
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    if (data !== undefined) {
      console.log(`[${timestamp}] ${message}`, data);
    } else {
      console.log(`[${timestamp}] ${message}`);
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
   * Error log for critical issues
   */
  error(message: string, error: Error | unknown): void {
    console.error(`❌ ${message}`, error);
  }
}

export const Logger = new LoggerClass();