import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CategoryRecord, Project } from '@naaseh/domain';
import { CategoryForm } from './CategoryForm.js';
import { ProjectForm } from './ProjectForm.js';
import { PermanentDeleteDialog } from '../archive/PermanentDeleteDialog.js';
import type { AssigneeOption } from '../../components/AssigneePicker.js';

function EditorDialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog ref={dialog} className="organization-editor" aria-label={title} onClose={close}>
      <div className="organization-editor-heading">
        <h2>{title}</h2>
        <button type="button" className="quiet" onClick={close}>
          Cancel
        </button>
      </div>
      {children}
    </dialog>
  );
}

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
  assignees = [],
}: {
  categories: CategoryRecord[];
  projects: Project[];
  createCategory: (value: {
    name: string;
    color: string;
    defaultAssigneeId?: string;
  }) => Promise<void> | void;
  updateCategory: (
    category: CategoryRecord,
    patch: Partial<CategoryRecord>,
  ) => Promise<void> | void;
  createProject: (value: {
    categoryId: string;
    name: string;
    endDate?: string;
  }) => Promise<void> | void;
  updateProject: (project: Project, patch: Partial<Project>) => Promise<void> | void;
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
  assignees?: readonly AssigneeOption[];
}) {
  const [editingCategory, setEditingCategory] = useState<CategoryRecord>();
  const [editingProject, setEditingProject] = useState<Project>();
  return (
    <section className="organization-page" aria-labelledby="organization-heading">
      <header className="organization-heading">
        <h1 id="organization-heading">Categories and Projects</h1>
        <p>Projects live inside categories. Open a category below to see its projects.</p>
      </header>
      <div className="organization-create-actions">
        <details className="organization-create">
          <summary>Add category</summary>
          <CategoryForm assignees={assignees} save={createCategory} />
        </details>
        {categories.some((category) => category.lifecycle !== 'archived' && !category.archived) && (
          <details className="organization-create">
            <summary>Add project</summary>
            <ProjectForm
              categories={categories.filter(
                (category) => category.lifecycle !== 'archived' && !category.archived,
              )}
              save={createProject}
            />
          </details>
        )}
      </div>
      {categories.length === 0 && <p>No categories yet. Add one to organize your projects.</p>}
      <ul className="organization-tree" aria-label="Category and Project tree">
        {categories.map((category) => {
          const children = projects.filter((project) => project.categoryId === category.id);
          const archived = category.lifecycle === 'archived' || category.archived;
          return (
            <li className="organization-category" key={category.id}>
              <details open>
                <summary>
                  <span
                    className="organization-color"
                    style={{ backgroundColor: category.color }}
                    aria-hidden="true"
                  />
                  <span className="organization-category-name">{category.name}</span>
                  <span className="organization-count">
                    {children.length} project{children.length === 1 ? '' : 's'}
                  </span>
                  {archived && <span className="organization-status">Archived</span>}
                </summary>
                <div className="organization-category-body">
                  <div className="organization-actions">
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => setEditingCategory(category)}
                    >
                      Edit Category
                    </button>
                    <button
                      type="button"
                      className="quiet"
                      onClick={() =>
                        changeCategoryLifecycle(category, archived ? 'restore' : 'archive', actorId)
                      }
                    >
                      {archived ? 'Restore Category' : 'Archive Category'}
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
                  </div>
                  {children.length === 0 && (
                    <p className="organization-empty">No projects in this category.</p>
                  )}
                  <ul className="organization-projects">
                    {children.map((project) => (
                      <li className="organization-project" key={project.id}>
                        <div className="organization-project-name">
                          <strong>{project.name}</strong>
                          {project.endDate && <small>Ends {project.endDate}</small>}
                          {project.lifecycle === 'archived' && (
                            <span className="organization-status">Archived</span>
                          )}
                        </div>
                        <div className="organization-actions">
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
                            {project.lifecycle === 'archived'
                              ? 'Restore Project'
                              : 'Archive Project'}
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
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      {editingCategory && (
        <EditorDialog
          title={`Edit category: ${editingCategory.name}`}
          close={() => setEditingCategory(undefined)}
        >
          <CategoryForm
            key={editingCategory.id}
            initial={editingCategory}
            assignees={assignees}
            save={async (value) => {
              await updateCategory(editingCategory, {
                ...value,
                defaultAssigneeId: value.defaultAssigneeId,
              });
              setEditingCategory(undefined);
            }}
          />
        </EditorDialog>
      )}
      {editingProject && (
        <EditorDialog
          title={`Edit project: ${editingProject.name}`}
          close={() => setEditingProject(undefined)}
        >
          <ProjectForm
            key={editingProject.id}
            initial={editingProject}
            categories={categories}
            save={async (value) => {
              await updateProject(editingProject, value);
              setEditingProject(undefined);
            }}
          />
        </EditorDialog>
      )}
    </section>
  );
}
