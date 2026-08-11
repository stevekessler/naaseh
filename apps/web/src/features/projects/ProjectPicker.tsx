import type { CategoryRecord, Project } from '@naaseh/domain';
import { projectEffectivelyAssignable } from '@naaseh/domain';
import { projectsByCategory } from '../../db/project-repository.js';

export function ProjectPicker({
  categories,
  projects,
  defaultValue,
  value,
  categoryId,
  onChange,
  allLabel,
  includeArchived = false,
}: {
  categories: readonly CategoryRecord[];
  projects: readonly Project[];
  defaultValue?: string;
  value?: string;
  categoryId?: string;
  onChange?: (value: string) => void;
  allLabel?: string;
  includeArchived?: boolean;
}) {
  const grouped = projectsByCategory(projects);
  const selected = value ?? defaultValue ?? '';
  const selectedProject = projects.find((project) => project.id === selected);
  const visibleCategories = categoryId
    ? categories.filter((category) => category.id === categoryId)
    : categories;
  return (
    <label>
      Project
      <select
        name="projectId"
        {...(value === undefined ? { defaultValue: selected } : { value: selected })}
        {...(onChange ? { onChange: (event) => onChange(event.target.value) } : {})}
      >
        <option value="">{allLabel ?? 'Unassigned'}</option>
        {selectedProject && categoryId && selectedProject.categoryId !== categoryId ? (
          <option value={selectedProject.id}>{selectedProject.name}</option>
        ) : null}
        {visibleCategories.map((category) => {
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
