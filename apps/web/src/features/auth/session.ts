export interface BrowserSession {
  userId: string;
  displayName: string;
  csrfToken: string;
  role: 'admin' | 'user';
}
export const saveSessionView = (session: BrowserSession) =>
  sessionStorage.setItem('naaseh-session-view', JSON.stringify(session));
export const clearSessionView = () => sessionStorage.removeItem('naaseh-session-view');
