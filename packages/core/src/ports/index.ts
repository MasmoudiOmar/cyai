/** Source of the current time. Inject a fake in tests. */
export interface Clock {
  readonly now: () => Date;
}

/** Source of unique session identifiers (UUIDs). */
export interface IdGenerator {
  readonly next: () => string;
}
