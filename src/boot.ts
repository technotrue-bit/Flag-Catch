/**
 * Starts the game. On TrueAIGaming's play page the page's copy of the save is put back first (see mirror.ts), so
 * everything the game reads at start up is already there.
 */
import { startMirror } from "./mirror";

startMirror("flag-catch")
  .catch(() => {
    // Without the page's copy the game still starts, with what this browser kept.
  })
  .then(() => import("./main"));
