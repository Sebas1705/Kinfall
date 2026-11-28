// The game hub in the console layout (no page scroll): the heading and one 48 dp radio card per
// registered game in the primary region (a playable game shows its tagline, a game that is not playable
// yet shows the "Coming soon" badge, wears a muted text and is disabled for screen readers while staying
// pressable), and Play for the focused game in the rail (a band in portrait). A press on a game that is
// not playable yet focuses it and announces `hub.soonAnnounce` (a polite live region, plus an explicit
// announcement on iOS) instead of playing. The last game played is read on mount from AsyncStorage
// (platform/lastGame): Kinfall is focused from the first frame, so it never flickers. Mirrors the web
// hub (apps/web/src/view/screens/hub.ts). Sizes are in hubMetrics, which the fit tests prove.
import { GAMES, findGame, initialFocus, type GameDef, type GameId } from '@kinfall/core/games/registry';
import { effectiveTextScale } from '@kinfall/core/layout/spec';
import { t } from '@kinfall/core/platform/i18n';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useAnnounce } from '../platform/announce';
import { readLastGame, writeLastGame } from '../platform/lastGame';
import { useLang } from '../platform/LangContext';
import { useTextSize } from '../platform/textSizeSetting';
import { useTheme } from '../theme';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { fitText } from '../ui/fitText';
import { Hud } from '../ui/Hud';
import { FramePressable } from '../ui/PixelFrame';
import { Screen } from '../ui/Screen';
import { useSheetBackdropProps } from '../ui/Sheet';
import { useLayoutSpec } from '../ui/useLayoutSpec';
import { useSettingsSheet } from '../ui/useSettingsSheet';
import { MESSAGE_BORDER, MESSAGE_SIZE, messageHeight } from './battleMetrics';
import {
  BADGE_PAD_X,
  BADGE_SIZE,
  BADGE_CHROME,
  CARD_GAP,
  HEADING_SIZE,
  MAIN_GAP,
  MAIN_PAD,
  NAME_SIZE,
  RAIL_PAD,
  TAGLINE_LINES_MAX,
  TAGLINE_MIN_SCALE,
  TAGLINE_SIZE,
  buttonHeight,
  cardHeight,
  headingHeight,
  showHeading,
  taglineLines,
} from './hubMetrics';

export interface HubScreenProps {
  /** Called with the id of a playable game when the player starts it. */
  onPlay: (id: GameId) => void;
}

interface Soon {
  /** Bumped by every press, so the same text announces again. */
  n: number;
  /** The game, so the text follows the language. */
  id: GameId;
}

function GameCard({ game, checked, onSelect, scale, fixed, lines }: { game: GameDef; checked: boolean; onSelect: () => void; scale: number; fixed: boolean; lines: number }) {
  const theme = useTheme();
  const soon = game.status === 'soon';
  const name = t(game.nameKey);
  const tagline = t(game.taglineKey);
  return (
    <FramePressable
      onPress={onSelect}
      // The chosen game wears the ornate plate; the dot in the name says it in text too.
      kind={checked ? 'plate' : 'button'}
      accessibilityRole="radio"
      // "Disabled" for screen readers only: the press still selects the card and announces.
      accessibilityState={{ checked, disabled: soon }}
      accessibilityLabel={soon ? `${name}, ${t('hub.soon')}` : `${name}. ${tagline}`}
      testID={`game-${game.id}`}
      style={[styles.card, fixed ? { height: cardHeight(scale, game.status, lines) } : { minHeight: cardHeight(scale, game.status, lines) }]}
      padX={2}
      padY={0}
    >
      {({ textColor }) => (
        <View style={soon ? styles.cardRow : styles.cardBody}>
          <AppText style={[styles.name, soon ? styles.shrink : null, { color: soon && !checked ? theme.muted : textColor }]} {...fitText(fixed, 1, 0.7)}>
            {checked ? '● ' : '○ '}
            {name}
          </AppText>
          {soon ? (
            <View style={[styles.badge, styles.shrink, { borderColor: theme.border }]}>
              <AppText style={[styles.badgeText, { color: theme.muted }]} {...fitText(fixed, 1, 0.7)}>
                {t('hub.soon')}
              </AppText>
            </View>
          ) : (
            <AppText style={[styles.tagline, { color: textColor }]} {...fitText(fixed, lines, TAGLINE_MIN_SCALE)}>
              {tagline}
            </AppText>
          )}
        </View>
      )}
    </FramePressable>
  );
}

/** The announcement of a game that is not playable yet: a polite live region (it floats in Screen's overlay). */
function SoonMessage({ soon, landscape }: { soon: Soon | null; landscape: boolean }) {
  const theme = useTheme();
  const text = soon ? t('hub.soonAnnounce', { game: t(findGame(soon.id).nameKey) }) : '';
  // iOS has no live regions: the text is announced once per press.
  useAnnounce(soon ? soon.n : null, text);
  return (
    <View
      style={[styles.message, soon ? { backgroundColor: theme.surface, borderColor: theme.border, borderTopWidth: MESSAGE_BORDER } : null]}
      testID="hub-message"
    >
      <View accessibilityLiveRegion="polite" testID="hub-soon">
        {soon ? (
          <AppText key={soon.n} style={[styles.messageText, { color: theme.text }]} numberOfLines={landscape ? 1 : 2} testID="hub-soon-text">
            {text}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

export function HubScreen({ onPlay }: HubScreenProps) {
  const spec = useLayoutSpec('hub');
  const { fontScale } = useWindowDimensions();
  const appSize = useTextSize();
  const theme = useTheme();
  const scale = effectiveTextScale(fontScale, appSize / 100);
  const landscape = spec.orientation === 'landscape';
  const consoleMode = spec.mode === 'console';
  useLang();
  const settings = useSettingsSheet();
  const backdrop = useSheetBackdropProps(settings.visible);

  // Kinfall is focused from the first frame; the stored game replaces it only if it is another playable
  // game, and never once the player has already chosen.
  const [focused, setFocused] = useState<GameId>(() => initialFocus(undefined));
  const [soon, setSoon] = useState<Soon | null>(null);
  const chosen = useRef(false);
  const presses = useRef(0);
  useEffect(() => {
    let live = true;
    void readLastGame().then((last) => {
      if (live && !chosen.current) setFocused(initialFocus(last));
    });
    return () => {
      live = false;
    };
  }, []);

  const announceSoon = (game: GameDef) => setSoon({ n: ++presses.current, id: game.id });

  const select = (game: GameDef) => {
    chosen.current = true;
    setFocused(game.id);
    if (game.status === 'soon') announceSoon(game);
    else setSoon(null);
  };

  const play = () => {
    const game = findGame(focused);
    if (game.status === 'soon') {
      announceSoon(game);
      return;
    }
    void writeLastGame(game.id);
    onPlay(game.id);
  };

  // Lines of a playable tagline: what its text needs in this width (at most TAGLINE_LINES_MAX).
  const lines = Math.max(...GAMES.filter((g) => g.status === 'playable').map((g) => taglineLines(t(g.taglineKey), spec.regions.primary.width, scale)));

  const heading = !consoleMode || showHeading(spec.regions.primary.height, scale, landscape, lines);

  const main = (
    // In landscape the announcement floats over the bottom of this region: its line is reserved.
    <View style={consoleMode ? [styles.mainFill, landscape ? { paddingBottom: MAIN_PAD + messageHeight(scale, 1) } : null] : styles.main} testID="hub-main">
      {heading ? (
        <AppText
          style={[styles.heading, { color: theme.text }, consoleMode ? { height: headingHeight(scale) } : null]}
          accessibilityRole="header"
          {...fitText(consoleMode, 1, 0.7)}
          testID="hub-title"
        >
          {t('hub.title')}
        </AppText>
      ) : null}
      <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel={t('hub.games')} testID="hub-games">
        {GAMES.map((game) => (
          <GameCard key={game.id} game={game} checked={game.id === focused} onSelect={() => select(game)} scale={scale} fixed={consoleMode} lines={lines} />
        ))}
      </View>
    </View>
  );

  const actions = (
    <View style={styles.rail} testID="hub-actions">
      <Button
        label={t('hub.play')}
        variant="primary"
        onPress={play}
        testID="hub-play"
        style={consoleMode ? { height: buttonHeight(scale) } : { minHeight: buttonHeight(scale) }}
        fit={consoleMode}
      />
    </View>
  );

  const hud = <Hud screen="hub" onSettings={settings.open} settingsRef={settings.openerRef} />;

  return (
    <View style={styles.root}>
      <Screen
        screen="hub"
        testID="hub-screen"
        hud={hud}
        primary={main}
        actions={actions}
        overlay={<SoonMessage soon={soon} landscape={landscape} />}
        backdrop={backdrop}
      />
      {settings.sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  main: { gap: MAIN_GAP },
  mainFill: { flex: 1, minHeight: 0, gap: MAIN_GAP, padding: MAIN_PAD },
  heading: { fontSize: HEADING_SIZE, fontWeight: '700' },
  list: { gap: MAIN_GAP },
  card: { alignItems: 'flex-start', justifyContent: 'center', overflow: 'hidden' },
  cardBody: { gap: 2, alignSelf: 'stretch' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: CARD_GAP, alignSelf: 'stretch' },
  shrink: { flexShrink: 1, minWidth: 0 },
  name: { fontSize: NAME_SIZE, fontWeight: '700' },
  tagline: { fontSize: TAGLINE_SIZE },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: BADGE_PAD_X / 2 - 1, paddingVertical: BADGE_CHROME / 2 - 1 },
  badgeText: { fontSize: BADGE_SIZE },
  rail: { padding: RAIL_PAD },
  message: { paddingHorizontal: 4 },
  messageText: { fontSize: MESSAGE_SIZE },
});
