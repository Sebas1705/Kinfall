// Turn controller of the battle screen. The state machine lives in core (shared with the mobile
// app, see @webgames/core/models/battleController); the web reports to the console by default.
import {
  createBattleController as createCoreBattleController,
  type ControllerDeps as CoreControllerDeps,
  type BattleController,
} from '@webgames/core/models/battleController';

export { watchdogMs } from '@webgames/core/models/battleController';
export type { BattleController, BattleUi } from '@webgames/core/models/battleController';

export interface ControllerDeps extends Omit<CoreControllerDeps, 'logger'> {
  logger?: CoreControllerDeps['logger'];
}

export function createBattleController(deps: ControllerDeps): BattleController {
  return createCoreBattleController({ ...deps, logger: deps.logger ?? console });
}
