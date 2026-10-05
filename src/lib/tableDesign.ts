/** Pages whose existing table presentation is intentionally preserved. */
export function tableDesignForTab(tab?: string): 'standard' | 'legacy' {
  return ['dashboard', 'hierarchy'].includes(tab || '') ? 'legacy' : 'standard';
}
