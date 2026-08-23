export const GAME_ASSET_ROOT = '/assets/game/moon-atlas-v1/sprites';

export const MOON_ASSETS = {
  'moon-waxing-crescent': `${GAME_ASSET_ROOT}/01-waxing-crescent.png`,
  'moon-first-quarter': `${GAME_ASSET_ROOT}/02-first-quarter.png`,
  'moon-full-moon': `${GAME_ASSET_ROOT}/03-full-moon.png`,
  'moon-last-quarter': `${GAME_ASSET_ROOT}/04-last-quarter.png`,
  'moon-waning-crescent': `${GAME_ASSET_ROOT}/05-waning-crescent.png`,
  // Atlas cell 09 was generated with the waning crescent facing the wrong way.
  // Cell 14 is the matching hurt/squint frame for the waxing crescent.
  'moon-waxing-crescent-hurt': `${GAME_ASSET_ROOT}/14-waxing-crescent-squint.png`,
  'moon-first-quarter-hurt': `${GAME_ASSET_ROOT}/10-first-quarter-hurt.png`,
  'moon-full-moon-hurt': `${GAME_ASSET_ROOT}/11-full-moon-hurt.png`,
  'moon-last-quarter-hurt': `${GAME_ASSET_ROOT}/12-last-quarter-hurt.png`,
  'moon-waning-crescent-hurt': `${GAME_ASSET_ROOT}/13-waning-crescent-hurt.png`,
} as const;

export const FX_ASSETS = {
  'fx-explosion-01': '/assets/game/effects-atlas-v1/sprites/01-explosion-01.png',
  'fx-explosion-02': '/assets/game/effects-atlas-v1/sprites/02-explosion-02.png',
  'fx-explosion-03': '/assets/game/effects-atlas-v1/sprites/03-explosion-03.png',
  'fx-explosion-04': '/assets/game/effects-atlas-v1/sprites/04-explosion-04.png',
  'fx-sparkle-01': '/assets/game/effects-atlas-v1/sprites/05-sparkle-01.png',
  'fx-sparkle-02': '/assets/game/effects-atlas-v1/sprites/06-sparkle-02.png',
  'fx-sparkle-03': '/assets/game/effects-atlas-v1/sprites/07-sparkle-03.png',
  'fx-sparkle-04': '/assets/game/effects-atlas-v1/sprites/08-sparkle-04.png',
} as const;

export const HUD_ASSETS = {
  heartFull: '/assets/game/effects-atlas-v1/sprites/13-heart-full.png',
  heartEmpty: '/assets/game/effects-atlas-v1/sprites/15-heart-empty.png',
  comboStar: '/assets/game/effects-atlas-v1/sprites/16-combo-star.png',
} as const;
