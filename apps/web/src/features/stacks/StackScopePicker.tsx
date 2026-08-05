import type { LocalStackScope } from '../../db/personal-stack-repository.js';

export interface StackProjectOption {
  id: string;
  name: string;
}

export function StackScopePicker({
  scope,
  projects,
  change,
}: {
  scope: LocalStackScope;
  projects: readonly StackProjectOption[];
  change: (scope: LocalStackScope) => void;
}) {
  const value = scope.scopeType === 'overall' ? 'overall' : `project:${scope.scopeId}`;
  return (
    <label className="stack-scope-picker">
      <span>Stack scope</span>
      <select
        aria-label="Stack scope"
        value={value}
        onChange={(event) => {
          const selected = event.currentTarget.value;
          change(
            selected === 'overall'
              ? { scopeType: 'overall' }
              : { scopeType: 'project', scopeId: selected.slice('project:'.length) },
          );
        }}
      >
        <option value="overall">Overall stack</option>
        {projects.map((project) => (
          <option key={project.id} value={`project:${project.id}`}>
            {project.name} Project stack
          </option>
        ))}
      </select>
    </label>
  );
}
