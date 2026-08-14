import { WizardState } from "./types";

// Simple in-memory conversation state, keyed by the initiating user's Telegram ID.
// Resets on process restart -- fine for an MVP. Move to a DB table if you need
// wizard state to survive redeploys on Render.
const wizardStates = new Map<number, WizardState>();

export function getWizardState(userId: number): WizardState | undefined {
  return wizardStates.get(userId);
}

export function setWizardState(userId: number, state: WizardState) {
  wizardStates.set(userId, state);
}

export function clearWizardState(userId: number) {
  wizardStates.delete(userId);
}
