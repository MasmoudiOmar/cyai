/** Which spec document a session or interview is bound to. */
export type BindingKind = "profile" | "rubric";

export interface BindingMismatch {
  readonly code: "binding_mismatch";
  readonly kind: BindingKind;
  readonly expected: string;
  readonly received: string;
}

/** Returns a mismatch error when a document id differs from the id it is bound to. */
export function checkBinding(
  kind: BindingKind,
  expected: string,
  received: string,
): BindingMismatch | undefined {
  return expected === received ? undefined : { code: "binding_mismatch", kind, expected, received };
}
