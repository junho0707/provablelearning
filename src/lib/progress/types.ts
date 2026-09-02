export type ProfileProgress = {
  attempts: { questionId: string; isCorrect: boolean; submittedAt: string }[];
  completedLessons: string[];
};
