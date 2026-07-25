import type { CategoryRecord, Project } from '@naaseh/domain';
import { projectEffectivelyAssignable } from '@naaseh/domain';
import { projectsByCategory } from '../../db/project-repository.js';

export function ProjectPicker({
  categories,
  projects,
  defaultValue,
  includeArchived = false,
}: {
  categories: CategoryRecord[];
  projects: Project[];
  defaultValue?: string;
  includeArchived?: boolean;
}) {
  const grouped = projectsByCategory(projects);
  return (
    <label>
      Project
      <select name="projectId" defaultValue={defaultValue ?? ''}>
        <option value="">Unassigned</option>
        {categories.map((category) => {
          const values = grouped.get(category.id) ?? [];
          const visible = includeArchived
            ? values
            : values.filter((project) => projectEffectivelyAssignable(project, category));
          return visible.length ? (
            <optgroup key={category.id} label={category.name}>
              {visible.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                  {project.lifecycle === 'archived' ? ' (archived)' : ''}
                </option>
              ))}
            </optgroup>
          ) : null;
        })}
      </select>
    </label>
  );
}
