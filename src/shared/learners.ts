/** The list of learners (spec 7.7) as it crosses the wire. Instructors only. */
import type { RoomInfo } from "./protocol.ts";

export const LEARNERS_PAGE_SIZE = 25;

export type LearnerView = {
  id: string;
  name: string;
  email: string;
  /** When the account was made, in milliseconds. */
  createdAt: number;
  rooms: RoomInfo[];
};

export type LearnersPage = { learners: LearnerView[]; page: number; pageSize: number; total: number };
