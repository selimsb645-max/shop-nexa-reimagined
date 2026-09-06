/**
 * AVENTA CORE — Kernel: generic state machine (Prompt 06 §2)
 *
 * The same transition-table shape already proven by
 * orderStateMachine, campaignStateMachine and settlementStateMachine.
 * This factory formalizes it so NEW domains (product QC, logistics…)
 * get the identical guarantees for free:
 *   - explicit legal transitions only (no string soup)
 *   - terminal states are terminal
 *   - every decision is a pure function → trivially testable
 * Existing machines keep working — they are NOT rewritten (dev rules:
 * preserve existing working features).
 */

export interface StateMachine<S extends string> {
  states: readonly S[];
  transitions: Readonly<Record<S, readonly S[]>>;
  terminal: readonly S[];
}

export function defineMachine<S extends string>(
  states: readonly S[],
  transitions: Readonly<Record<S, readonly S[]>>,
  terminal: readonly S[],
): StateMachine<S> {
  return { states, transitions, terminal };
}

/** Pure transition check — the single authority for "is this legal?" */
export function canTransition<S extends string>(
  machine: StateMachine<S>,
  from: S,
  to: S,
): boolean {
  if (from === to) return true; // no-op transitions allowed everywhere
  const legal = machine.transitions[from];
  return Array.isArray(legal) && legal.includes(to);
}

export function isTerminal<S extends string>(
  machine: StateMachine<S>,
  state: S,
): boolean {
  return machine.terminal.includes(state);
}

/** Throws a typed error when the transition is illegal (server-side guard). */
export function assertTransition<S extends string>(
  machine: StateMachine<S>,
  from: S,
  to: S,
  label: string,
): void {
  if (!canTransition(machine, from, to)) {
    throw new Error(
      `kernel/machine[${label}]: illegal transition ${from} → ${to}`,
    );
  }
}
