import { useState } from 'react';
import type { CategoryRecord, Project } from '@naaseh/domain';
import { CategoryForm } from './CategoryForm.js';
import { ProjectForm } from './ProjectForm.js';
import { PermanentDeleteDialog } from '../archive/PermanentDeleteDialog.js';

export function CategoriesAdminPage({
  categories,
  projects,
  createCategory,
  updateCategory,
  createProject,
  updateProject,
  actorId,
  csrfToken,
  changeCategoryLifecycle,
  changeProjectLifecycle,
}: {
  categories: CategoryRecord[];
  projects: Project[];
  createCategory: (value: { name: string; color: string }) => void;
  updateCategory: (category: CategoryRecord, patch: Partial<CategoryRecord>) => void;
  createProject: (value: { categoryId: string; name: string; endDate?: string }) => void;
  updateProject: (project: Project, patch: Partial<Project>) => void;
  actorId: string;
  csrfToken: string;
  changeCategoryLifecycle: (
    category: CategoryRecord,
    action: 'archive' | 'restore',
    actorId: string,
  ) => void;
  changeProjectLifecycle: (
    project: Project,
    action: 'archive' | 'restore',
    actorId: string,
  ) => void;
}) {
  const [editingCategory, setEditingCategory] = useState<CategoryRecord>();
  const [editingProject, setEditingProject] = useState<Project>();
  return (
    <section aria-labelledby="organization-heading">
      <h1 id="organization-heading">Categories and Projects</h1>
      <p>Categories are level one. Projects are level two and hold work assignments.</p>
      <CategoryForm
        key={editingCategory?.id ?? 'new-category'}
        {...(editingCategory ? { initial: editingCategory } : {})}
        save={(value) => {
          if (editingCategory) updateCategory(editingCategory, value);
          else createCategory(value);
          setEditingCategory(undefined);
        }}
      />
      {categories.length > 0 && (
        <ProjectForm
          key={editingProject?.id ?? 'new-project'}
          categories={categories}
          {...(editingProject ? { initial: editingProject } : {})}
          save={(value) => {
            if (editingProject) updateProject(editingProject, value);
            else createProject(value);
            setEditingProject(undefined);
          }}
        />
      )}
      <ul className="organization-tree" aria-label="Category and Project tree">
        {categories.map((category) => (
          <li key={category.id}>
            <details open>
              <summary>
                <span style={{ color: category.color }}>●</span> {category.name}
                {category.lifecycle === 'archived' || category.archived ? ' (archived)' : ''}
              </summary>
              <button type="button" className="quiet" onClick={() => setEditingCategory(category)}>
                Edit Category
              </button>
              <button
                type="button"
                className="quiet"
                onClick={() =>
                  changeCategoryLifecycle(
                    category,
                    category.lifecycle === 'archived' || category.archived ? 'restore' : 'archive',
                    actorId,
                  )
                }
              >
                {category.lifecycle === 'archived' || category.archived
                  ? 'Restore Category'
                  : 'Archive Category'}
              </button>
              <PermanentDeleteDialog
                target={{
                  resourceType: 'category',
                  resourceId: category.id,
                  version: category.version,
                }}
                label={category.name}
                csrfToken={csrfToken}
              />
              <ul>
                {projects
                  .filter((project) => project.categoryId === category.id)
                  .map((project) => (
                    <li key={project.id}>
                      <span>{project.name}</span>
                      {project.endDate && <span> · ends {project.endDate}</span>}
                      {project.lifecycle === 'archived' && <span> (archived)</span>}
                      <button
                        type="button"
                        className="quiet"
                        onClick={() => setEditingProject(project)}
                      >
                        Edit Project
                      </button>
                      <button
                        type="button"
                        className="quiet"
                        onClick={() =>
                          changeProjectLifecycle(
                            project,
                            project.lifecycle === 'archived' ? 'restore' : 'archive',
                            actorId,
                          )
                        }
                      >
                        {project.lifecycle === 'archived' ? 'Restore Project' : 'Archive Project'}
                      </button>
                      <PermanentDeleteDialog
                        target={{
                          resourceType: 'project',
                          resourceId: project.id,
                          version: project.version,
                        }}
                        label={project.name}
                        csrfToken={csrfToken}
                      />
                    </li>
                  ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
