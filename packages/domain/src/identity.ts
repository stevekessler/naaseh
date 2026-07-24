export interface User {
  id: string;
  username: string;
  displayName: string;
  pictureKey?: string;
  role: 'admin' | 'user';
  active: boolean;
}

export interface Session {
  id: string;
  userId: string;
  csrfToken: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface Group {
  id: string;
  name: string;
  ownerId: string;
  hasJoinPin: boolean;
}
