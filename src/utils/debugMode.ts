/**
 * Debug mode utilities
 * Debug mode shows technical information and advanced controls
 * Activated by adding ?debug=true to the URL
 */

/**
 * Check if debug mode is enabled
 */
export function isDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  
  const params = new URLSearchParams(window.location.search);
  return params.get('debug') === 'true';
}

/**
 * Get debug mode from URL on initial load
 */
export const DEBUG_MODE = isDebugMode();

/**
 * Toggle debug mode (updates URL)
 */
export function toggleDebugMode(): void {
  const params = new URLSearchParams(window.location.search);
  
  if (isDebugMode()) {
    params.delete('debug');
  } else {
    params.set('debug', 'true');
  }
  
  const newUrl = params.toString() 
    ? `${window.location.pathname}?${params.toString()}`
    : window.location.pathname;
    
  window.location.replace(newUrl);
}

/**
 * Log only in debug mode
 */
export function debugLog(...args: any[]): void {
  if (DEBUG_MODE) {
    console.log('[DEBUG]', ...args);
  }
}