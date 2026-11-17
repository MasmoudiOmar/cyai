/** MCP tool names, shared by registration and by the instructions that tell the agent what to call next. */
export const TOOLS = {
  listInterviews: "list_interviews",
  listSessions: "list_sessions",
  start: "start_interview",
  provideQuestion: "provide_question",
  submitAnswer: "submit_answer",
  submitEvaluation: "submit_evaluation",
  resume: "resume_interview",
  abandon: "abandon_interview",
} as const;

export const MOCK_INTERVIEW_PROMPT = "mock_interview";
