import { type CategoryRecord, type Project, type Urgency } from '@naaseh/domain';
import type { CompletionPeriod } from './completion-bucketing.js';
import { PriorityFilter } from '../../components/PriorityFilter.js';

export interface CompletionFilterValue {
  period: CompletionPeriod;
  categoryId: string;
  projectId: string;
  timeZone: string;
  weekStartsOn: number;
  urgencies: Urgency[];
}

export function CompletionFilters({
  value,
  categories,
  projects,
  change,
}: {
  value: CompletionFilterValue;
  categories: readonly CategoryRecord[];
  projects: readonly Project[];
  change: (value: CompletionFilterValue) => void;
}) {
  const categoryProjects = value.categoryId
    ? projects.filter((project) => project.categoryId === value.categoryId)
    : projects;
  return (
    <fieldset className="completion-filters">
      <legend>Completion report filters</legend>
      <label>
        Period
        <select
          value={value.period}
          onChange={(event) => change({ ...value, period: event.target.value as CompletionPeriod })}
        >
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </select>
      </label>
      <label>
        Category
        <select
          value={value.categoryId}
          onChange={(event) => change({ ...value, categoryId: event.target.value, projectId: '' })}
        >
          <option value="">All categories</option>
          <option value="unassigned">Unassigned</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
              {category.lifecycle === 'archived' || category.archived ? ' (archived)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        Project
        <select
          value={value.projectId}
          onChange={(event) => change({ ...value, projectId: event.target.value })}
        >
          <option value="">All projects</option>
          <option value="unassigned">Unassigned</option>
          {categoryProjects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
              {project.lifecycle === 'archived' ? ' (archived)' : ''}
            </option>
          ))}
        </select>
      </label>
      {value.period === 'week' && (
        <label>
          Week starts
          <select
            value={value.weekStartsOn}
            onChange={(event) => change({ ...value, weekStartsOn: Number(event.target.value) })}
          >
            <option value={0}>Sunday</option>
            <option value={1}>Monday</option>
            <option value={6}>Saturday</option>
          </select>
        </label>
      )}
      <PriorityFilter
        ariaLabel="Completion urgency filters"
        value={value.urgencies}
        change={(urgencies) => change({ ...value, urgencies })}
      />
    </fieldset>
  );
}
