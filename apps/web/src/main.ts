// Entry point. The default page is the run (title screen first); `?mode=battle` keeps the phase-1
// demo battle page, loaded on demand so the run page does not pay for the battle scene up front.
import './styles.css';
import { detectLang, setLang } from './platform/i18n';
import { startRunPage } from './view/runPage';

setLang(detectLang());

if (new URLSearchParams(location.search).get('mode') === 'battle') {
  void import('./view/battlePage').then((page) => page.startBattlePage());
} else {
  startRunPage();
}
