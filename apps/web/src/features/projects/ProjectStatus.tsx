import { deadlineState, type Project } from '@naaseh/domain';

export function ProjectStatus({ project, remaining }: { project: Project; remaining: number }) {
  const today = new Date().toLocaleDateString('en-CA');
  const state = deadlineState(project.endDate, today);
  return (
    <span className={`project-status project-status-${state}`}>
      {project.endDate ? `${state}: ${project.endDate}` : 'No end date'} · {remaining} remaining
    </span>
  );
}
