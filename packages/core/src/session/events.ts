import type { AskedQuestion, IsoDateTime, Scorecard, SessionStatus, TurnEvaluation } from "@cyai/spec";

/** Everything that can happen to a session. */
export type SessionEvent =
  | { readonly type: "start"; readonly at: IsoDateTime }
  | { readonly type: "ask"; readonly question: AskedQuestion }
  | { readonly type: "answer"; readonly text: string; readonly at: IsoDateTime }
  | { readonly type: "evaluate"; readonly evaluation: TurnEvaluation }
  | { readonly type: "finish"; readonly at: IsoDateTime }
  | { readonly type: "complete"; readonly scorecard: Scorecard }
  | { readonly type: "abandon"; readonly at: IsoDateTime; readonly reason: string };

export type SessionEventType = SessionEvent["type"];

export type TransitionError =
  | {
      readonly code: "invalid_transition";
      readonly from: SessionStatus;
      readonly event: SessionEventType;
    }
  | {
      readonly code: "clock_skew";
      readonly earliest: IsoDateTime;
      readonly received: IsoDateTime;
    }
  | {
      readonly code: "unknown_follow_up_target";
      readonly followUpOf: number;
      readonly turnCount: number;
    };

/** The timestamp an event carries, if any. */
export function eventTime(event: SessionEvent): IsoDateTime | undefined {
  switch (event.type) {
    case "start":
    case "answer":
    case "finish":
    case "abandon":
      return event.at;
    case "ask":
      return event.question.askedAt;
    case "evaluate":
    case "complete":
      return undefined;
  }
}
