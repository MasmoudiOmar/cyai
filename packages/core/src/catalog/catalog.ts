import {
  err,
  ok,
  type CandidateContext,
  type InterviewerProfile,
  type InterviewSpec,
  type Result,
  type Rubric,
} from "@cyai/spec";

import { createContext, type InterviewContext } from "../interview/context.js";
import type { BindingMismatch } from "../shared/binding.js";

export type TemplateKind = "profile" | "rubric" | "interview";

export interface CatalogError {
  readonly code: "duplicate_template" | "unknown_template";
  readonly kind: TemplateKind;
  readonly id: string;
}

export interface TemplateDocuments {
  readonly profiles: readonly InterviewerProfile[];
  readonly rubrics: readonly Rubric[];
  readonly interviews: readonly InterviewSpec[];
}

/** Templates indexed by id. */
export interface TemplateCatalog {
  readonly profiles: ReadonlyMap<string, InterviewerProfile>;
  readonly rubrics: ReadonlyMap<string, Rubric>;
  readonly interviews: ReadonlyMap<string, InterviewSpec>;
}

function indexById<T extends { readonly id: string }>(
  kind: TemplateKind,
  items: readonly T[],
): Result<ReadonlyMap<string, T>, CatalogError> {
  const index = new Map<string, T>();
  for (const item of items) {
    if (index.has(item.id)) {
      return err({ code: "duplicate_template", kind, id: item.id });
    }
    index.set(item.id, item);
  }
  return ok(index);
}

function lookup<T>(kind: TemplateKind, index: ReadonlyMap<string, T>, id: string): Result<T, CatalogError> {
  const item = index.get(id);
  return item === undefined ? err({ code: "unknown_template", kind, id }) : ok(item);
}

/** Indexes templates, rejecting duplicate ids within a kind. */
export function buildCatalog(documents: TemplateDocuments): Result<TemplateCatalog, CatalogError> {
  const profiles = indexById("profile", documents.profiles);
  if (!profiles.ok) {
    return profiles;
  }
  const rubrics = indexById("rubric", documents.rubrics);
  if (!rubrics.ok) {
    return rubrics;
  }
  const interviews = indexById("interview", documents.interviews);
  if (!interviews.ok) {
    return interviews;
  }
  return ok({ profiles: profiles.value, rubrics: rubrics.value, interviews: interviews.value });
}

/** Resolves an interview and the profile and rubric it is bound to. */
export function resolveInterview(
  catalog: TemplateCatalog,
  interviewId: string,
  candidate: CandidateContext,
): Result<InterviewContext, CatalogError | BindingMismatch> {
  const interview = lookup("interview", catalog.interviews, interviewId);
  if (!interview.ok) {
    return interview;
  }
  const profile = lookup("profile", catalog.profiles, interview.value.profileId);
  if (!profile.ok) {
    return profile;
  }
  const rubric = lookup("rubric", catalog.rubrics, interview.value.rubricId);
  if (!rubric.ok) {
    return rubric;
  }
  return createContext({ interview: interview.value, profile: profile.value, rubric: rubric.value, candidate });
}
