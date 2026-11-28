// Hub (game selection) strings. Merged into the main tables in strings.ts. The simulator and
// survival names are provisional.

export const hubEn = {
  'screen.hub': 'Games',
  'hub.title': 'Choose a game',
  'hub.play': 'Play',
  'hub.soon': 'Coming soon',
  'hub.soonAnnounce': '{game} is coming soon.',
  'hub.games': 'Games',
  'hub.game.kinfall.name': 'Kinfall',
  'hub.game.kinfall.tagline': 'A creature roguelike: build a team and survive the run.',
  'hub.game.simulator.name': 'Simulator',
  'hub.game.simulator.tagline': 'Coming soon.',
  'hub.game.survival.name': 'Survival',
  'hub.game.survival.tagline': 'Coming soon.',
} as const;

export const hubEs: Record<keyof typeof hubEn, string> = {
  'screen.hub': 'Juegos',
  'hub.title': 'Elige un juego',
  'hub.play': 'Jugar',
  'hub.soon': 'Próximamente',
  'hub.soonAnnounce': '{game} llegará pronto.',
  'hub.games': 'Juegos',
  'hub.game.kinfall.name': 'Kinfall',
  'hub.game.kinfall.tagline': 'Un roguelike de criaturas: forma un equipo y sobrevive a la partida.',
  'hub.game.simulator.name': 'Simulador',
  'hub.game.simulator.tagline': 'Próximamente.',
  'hub.game.survival.name': 'Supervivencia',
  'hub.game.survival.tagline': 'Próximamente.',
};
