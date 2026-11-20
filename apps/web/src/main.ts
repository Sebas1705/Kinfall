// Entry point. The default page is the run (title screen first); `?mode=battle` keeps the phase-1
// demo battle page, loaded on demand so the run page does not pay for the battle scene up front.
import './styles.css';
import { installWebI18n } from './platform/webI18n';
import { startRunPage } from './view/runPage';

installWebI18n();

if (new URLSearchParams(location.search).get('mode') === 'battle') {
  void import('./view/battlePage').then((page) => page.startBattlePage());
} else {
  startRunPage();
  // Scene art for the run screens (hero, banners, icons, vignettes, pixel frames): its own chunk,
  // which installs itself. Without it the screens work the same, only plainer.
  import('./art/screenArt').catch(() => {});
}
