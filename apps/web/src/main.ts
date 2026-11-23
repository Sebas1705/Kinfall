// Entry point. The default page is the game hub (Kinfall's run flow sits behind it); `?mode=battle` keeps the phase-1
// demo battle page, loaded on demand so the run page does not pay for the battle scene up front.
import './styles.css';
import { installWebI18n } from './platform/webI18n';
import { gameFromSearch } from '@kinfall/core/games/registry';
import { startRunPage } from './view/runPage';

installWebI18n();

if (new URLSearchParams(location.search).get('mode') === 'battle') {
  void import('./view/battlePage').then((page) => page.startBattlePage());
} else {
  // The hub is the default; old deep links (?seed=, ?game=kinfall) go straight to Kinfall's title.
  startRunPage(gameFromSearch(location.search) ? 'kinfall' : 'hub');
  // Scene art for the run screens (hero, banners, icons, vignettes, pixel frames): its own chunk,
  // which installs itself. Without it the screens work the same, only plainer.
  import('./art/screenArt').catch(() => {});
}
