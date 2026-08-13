import { normalizeUrgencySet, type Urgency } from '@naaseh/domain';
import { UrgencyBadge } from '../../components/UrgencyBadge.js';
import { UrgencyBreakdown } from '../../components/UrgencyBreakdown.js';
import { PriorityFilter } from '../../components/PriorityFilter.js';
import type { ReturnTypeWorkloadTree } from './project-tree-types.js';
import { ProjectStatus } from './ProjectStatus.js';

interface ProjectDetailRow {
  id: string;
  label: string;
  urgency: Urgency | string;
  overallRank: number;
  projectRank?: number;
}

export interface ProjectTreeProps {
  tree: ReturnTypeWorkloadTree;
  selectedUrgencies?: readonly string[];
  changeUrgencies?: (values: string[]) => void;
  detailRows?: readonly ProjectDetailRow[];
  detailScope?: 'category' | 'project' | 'unassigned';
  orderBy?: 'overallRank' | 'projectRank';
  changeOrder?: (order: 'overallRank' | 'projectRank') => void;
  nextCursor?: string | null;
  loadMore?: () => void;
  cursorError?: 'invalid' | 'expired' | 'context_changed';
  restart?: () => void;
}

const cursorErrorCopy = {
  invalid: 'Report continuation is invalid.',
  expired: 'Report continuation is expired.',
  context_changed: 'Report continuation changed because access or report context changed.',
} as const;

export function ProjectTree({
  tree,
  selectedUrgencies = [],
  changeUrgencies,
  detailRows = [],
  detailScope,
  orderBy = 'overallRank',
  changeOrder,
  nextCursor,
  loadMore,
  cursorError,
  restart,
}: ProjectTreeProps) {
  const selected = normalizeUrgencySet(selectedUrgencies as Urgency[]);
  const projectRankAvailable = detailScope === 'project';
  const effectiveOrder =
    orderBy === 'projectRank' && !projectRankAvailable ? 'overallRank' : orderBy;
  const sortedRows = [...detailRows].sort((left, right) => {
    const leftRank =
      effectiveOrder === 'projectRank' ? (left.projectRank ?? Infinity) : left.overallRank;
    const rightRank =
      effectiveOrder === 'projectRank' ? (right.projectRank ?? Infinity) : right.overallRank;
    return leftRank - rightRank || left.id.localeCompare(right.id);
  });
  return (
    <section aria-labelledby="projects-heading">
      <header className="welcome">
        <div>
          <p className="eyebrow">Workload as of {new Date(tree.asOf).toLocaleString()}</p>
          <h1 id="projects-heading">Projects</h1>
        </div>
      </header>
      {changeUrgencies ? (
        <PriorityFilter value={selected} change={changeUrgencies} ariaLabel="Current priorities" />
      ) : null}
      <ul className="project-workload-tree">
        {tree.categories.map(({ category, count, projects }) => (
          <li key={category.id}>
            <details open>
              <summary>
                <strong>{category.name}</strong>{' '}
                <span className="count-badge">{count.taskCount} to-dos</span>{' '}
                <span className="count-badge">{count.listCount} lists</span>
              </summary>
              <UrgencyBreakdown
                counts={count.urgencyCounts}
                label={`Current priority breakdown for ${category.name}`}
              />
              <ul>
                {projects.map(({ project, count: projectCount }) => (
                  <li key={project.id}>
                    <a href={`/tasks?projectId=${encodeURIComponent(project.id)}`}>
                      {project.name}
                    </a>{' '}
                    <span className="count-badge">{projectCount.taskCount} to-dos</span>{' '}
                    <span className="count-badge">{projectCount.listCount} lists</span>{' '}
                    <ProjectStatus
                      project={project}
                      remaining={projectCount.taskCount + projectCount.listCount}
                    />
                    <UrgencyBreakdown
                      counts={projectCount.urgencyCounts}
                      label={`Current priority breakdown for ${project.name}`}
                    />
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
        <li>
          <a href="/tasks?projectId=unassigned">Unassigned</a>{' '}
          <span className="count-badge">{tree.unassigned.taskCount} to-dos</span>{' '}
          <span className="count-badge">{tree.unassigned.listCount} lists</span>
          <UrgencyBreakdown
            counts={tree.unassigned.urgencyCounts}
            label="Current priority breakdown for Unassigned"
          />
        </li>
      </ul>
      {detailRows.length ? (
        <section aria-label="Workload report detail">
          {changeOrder ? (
            <fieldset>
              <legend>Sort report rows</legend>
              <label>
                <input
                  type="radio"
                  name="project-report-order"
                  checked={effectiveOrder === 'overallRank'}
                  onChange={() => changeOrder('overallRank')}
                />
                Sort by Overall rank
              </label>
              <label>
                <input
                  type="radio"
                  name="project-report-order"
                  checked={effectiveOrder === 'projectRank'}
                  disabled={!projectRankAvailable}
                  onChange={() => changeOrder('projectRank')}
                />
                Sort by Project rank
              </label>
            </fieldset>
          ) : null}
          {!projectRankAvailable && orderBy === 'projectRank' ? (
            <p role="status">Project rank is available only within one Project.</p>
          ) : null}
          <ol>
            {sortedRows.map((row) => (
              <li key={row.id}>
                {row.label} <UrgencyBadge urgency={row.urgency as Urgency} /> Overall position{' '}
                {row.overallRank}
                {projectRankAvailable && row.projectRank !== undefined
                  ? ` Project position ${row.projectRank}`
                  : ''}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {cursorError ? (
        <div role="alert">
          <p>{cursorErrorCopy[cursorError]}</p>
          {restart ? (
            <button type="button" onClick={restart}>
              Restart report
            </button>
          ) : null}
        </div>
      ) : null}
      {nextCursor && loadMore && !cursorError ? (
        <button type="button" onClick={loadMore}>
          Load more report rows
        </button>
      ) : null}
    </section>
  );
}
