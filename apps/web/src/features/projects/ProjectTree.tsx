import type { ReturnTypeWorkloadTree } from './project-tree-types.js';
import { ProjectStatus } from './ProjectStatus.js';

export function ProjectTree({ tree }: { tree: ReturnTypeWorkloadTree }) {
  return (
    <section aria-labelledby="projects-heading">
      <header className="welcome">
        <div>
          <p className="eyebrow">Workload as of {new Date(tree.asOf).toLocaleString()}</p>
          <h1 id="projects-heading">Projects</h1>
        </div>
      </header>
      <ul className="project-workload-tree">
        {tree.categories.map(({ category, count, projects }) => (
          <li key={category.id}>
            <details open>
              <summary>
                <strong>{category.name}</strong>{' '}
                <span className="count-badge">{count.taskCount} to-dos</span>{' '}
                <span className="count-badge">{count.listCount} lists</span>
              </summary>
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
        </li>
      </ul>
    </section>
  );
}
