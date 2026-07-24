export interface TaskViewState {
  focusedTaskId?: string;
  scrollY: number;
  query: string;
}
let state: TaskViewState = { scrollY: 0, query: '' };
export const rememberTaskView = (next: TaskViewState) => {
  state = next;
};
export const restoreTaskView = () => state;
