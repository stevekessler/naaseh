import { useState } from 'react';
import type { Task } from '@naaseh/domain';
import { useCompletionFeedback } from '../tasks/useCompletionFeedback.js';

export function usePostItCompletion(commit: (task: Task) => Promise<void>) {
  const [completing, setCompleting] = useState<string>();
  const feedback = useCompletionFeedback();
  return {
    completing,
    announcement: feedback.announcement,
    complete: async (task: Task) => {
      const completingTask = task.status !== 'completed';
      feedback.complete(task.label, completingTask);
      if (completingTask) setCompleting(task.id);
      try {
        await commit(task);
      } finally {
        window.setTimeout(() => setCompleting(undefined), 550);
      }
    },
  };
}
