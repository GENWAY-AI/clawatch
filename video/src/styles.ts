export const COLORS = {
  bg: '#09090b',
  card: '#18181b',
  cardBorder: '#27272a',
  emerald: '#10b981',
  emeraldDark: '#065f46',
  emeraldGlow: 'rgba(16, 185, 129, 0.3)',
  amber: '#f59e0b',
  red: '#ef4444',
  white: '#ffffff',
  gray100: '#f4f4f5',
  gray300: '#d4d4d8',
  gray400: '#a1a1aa',
  gray500: '#71717a',
  gray600: '#52525b',
  gray700: '#3f3f46',
  gray800: '#27272a',
  blue: '#3b82f6',
  purple: '#a855f7',
} as const;

export const FONTS = {
  sans: 'system-ui, -apple-system, sans-serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
} as const;

export const SCENE_DURATION = 180; // 6 seconds per feature scene
export const COST_MONITORING_DURATION = 240; // 8 seconds for cost monitoring
export const INTRO_DURATION = 150; // 5 seconds
export const OUTRO_DURATION = 120; // 4 seconds
export const TOTAL_DURATION = INTRO_DURATION + COST_MONITORING_DURATION + SCENE_DURATION * 5 + OUTRO_DURATION; // 1410 frames = 47s
