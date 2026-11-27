/**
 * The one visibility filter (spec 4 principle 2, 6.2). Every question that leaves the room
 * object, by snapshot, event or write response, is chosen by `canSee` and shaped by
 * `project`. Nothing else turns a row into a view.
 */
import type { QuestionView, Visibility } from "../../shared/protocol.ts";
import type { Role } from "../role.ts";

export type Viewer = { id: string; role: Role };

export type QuestionRow = {
  id: string;
  author_id: string;
  author_name: string;
  visibility: Visibility;
  body: string;
  created_at: number;
  resolved_at: number | null;
};

export type AnswerRow = {
  id: string;
  question_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: number;
};

/** Spec 6.1: private questions are for their asker and instructors only. */
export function canSee(viewer: Viewer, question: Pick<QuestionRow, "visibility" | "author_id">): boolean {
  return viewer.role === "instructor" || question.visibility === "public" || question.author_id === viewer.id;
}

/** Callers must have passed `canSee`. The asker's id is never part of a view. */
export function project(viewer: Viewer, question: QuestionRow, answers: readonly AnswerRow[]): QuestionView {
  // DEC-1: a private question shows the asker's name to instructors only.
  const showName = question.visibility === "public" || viewer.role === "instructor";
  return {
    id: question.id,
    visibility: question.visibility,
    body: question.body,
    authorName: showName ? question.author_name : null,
    isMine: question.author_id === viewer.id,
    createdAt: question.created_at,
    resolvedAt: question.resolved_at,
    answers: answers.map((answer) => {
      // The thread holds the asker's messages and instructors' (spec 6.1), so a message that
      // is not the asker's is an instructor's. No role is stored.
      const fromAsker = answer.author_id === question.author_id;
      return {
        id: answer.id,
        authorName: fromAsker && !showName ? null : answer.author_name,
        fromInstructor: !fromAsker,
        isMine: answer.author_id === viewer.id,
        body: answer.body,
        createdAt: answer.created_at,
      };
    }),
  };
}
