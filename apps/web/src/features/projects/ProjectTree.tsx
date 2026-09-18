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
    <section className="projects-page" aria-labelledby="projects-heading">
      <header className="welcome projects-header">
        <div>
          <p className="eyebrow">Workload as of {new Date(tree.asOf).toLocaleString()}</p>
          <h1 id="projects-heading">Categories and Projects</h1>
          <p className="projects-intro">
            See where active work is concentrated and what comes next.
          </p>
        </div>
      </header>
      {changeUrgencies ? (
        <div className="projects-filter-panel">
          <PriorityFilter
            value={selected}
            change={changeUrgencies}
            ariaLabel="Current priorities"
          />
        </div>
      ) : null}
      <ul className="project-workload-tree">
        {tree.categories.map(({ category, count, projects }) => (
          <li className="project-workload-card" key={category.id}>
            <details open>
              <summary className="project-workload-heading">
                <span className="project-workload-title">
                  <span className="project-workload-kicker">Category</span>
                  <strong>{category.name}</strong>
                </span>
                <span className="workload-counts">
                  <span className="count-badge">{count.taskCount} to-dos</span>
                  <span className="count-badge">{count.listCount} lists</span>
                </span>
              </summary>
              <div className="project-workload-body">
                <UrgencyBreakdown
                  counts={count.urgencyCounts}
                  label={`Current priority breakdown for ${category.name}`}
                  heading="Priority mix"
                  tiles
                />
                <ul className="project-workload-projects">
                  {projects.map(({ project, count: projectCount }) => (
                    <li key={project.id}>
                      <div className="project-row-heading">
                        <a href={`/tasks?projectId=${encodeURIComponent(project.id)}`}>
                          Project: {project.name}
                        </a>
                        <span className="workload-counts">
                          <span className="count-badge">{projectCount.taskCount} to-dos</span>
                          <span className="count-badge">{projectCount.listCount} lists</span>
                        </span>
                      </div>
                      <ProjectStatus
                        project={project}
                        remaining={projectCount.taskCount + projectCount.listCount}
                      />
                      <UrgencyBreakdown
                        counts={projectCount.urgencyCounts}
                        label={`Current priority breakdown for ${project.name}`}
                        heading="Priority mix"
                        tiles
                      />
                    </li>
                  ))}
                  {!projects.length ? (
                    <li className="project-empty">No projects in this category.</li>
                  ) : null}
                </ul>
              </div>
            </details>
          </li>
        ))}
        <li className="project-workload-card project-workload-unassigned">
          <div className="project-workload-heading">
            <span className="project-workload-title">
              <span className="project-workload-kicker">No project</span>
              <a href="/tasks?projectId=unassigned">Unassigned to a project</a>
            </span>
            <span className="workload-counts">
              <span className="count-badge">{tree.unassigned.taskCount} to-dos</span>
              <span className="count-badge">{tree.unassigned.listCount} lists</span>
            </span>
          </div>
          <div className="project-workload-body">
            <UrgencyBreakdown
              counts={tree.unassigned.urgencyCounts}
              label="Current priority breakdown for Unassigned"
              heading="Priority mix"
              tiles
            />
          </div>
        </li>
      </ul>
      {detailRows.length ? (
        <section className="workload-detail-card" aria-label="Workload report detail">
          <div className="workload-detail-header">
            <div>
              <p className="project-workload-kicker">Active queue</p>
              <h2>Ranked work</h2>
            </div>
            <span>
              {sortedRows.length} item{sortedRows.length === 1 ? '' : 's'}
            </span>
          </div>
          {changeOrder ? (
            <fieldset className="workload-sort">
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
          <ol className="workload-detail-list">
            {sortedRows.map((row) => (
              <li key={row.id}>
                <span className="workload-rank" aria-hidden="true">
                  {effectiveOrder === 'projectRank' ? row.projectRank : row.overallRank}
                </span>
                <strong>{row.label}</strong>
                <UrgencyBadge urgency={row.urgency as Urgency} />
                <span className="workload-positions">
                  Overall position {row.overallRank}
                  {projectRankAvailable && row.projectRank !== undefined
                    ? ` · Project position ${row.projectRank}`
                    : ''}
                </span>
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
