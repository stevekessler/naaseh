import { createContext, useContext, useState } from 'react';
export interface DirectoryUser {
  id: string;
  displayName: string;
  username: string;
  pictureUrl?: string;
}
export const UserDirectoryContext = createContext<DirectoryUser[]>([]);
export async function readUserDirectory(): Promise<DirectoryUser[]> {
  const response = await fetch('/api/v1/users/directory', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('User directory could not be loaded.');
  return ((await response.json()) as { items: DirectoryUser[] }).items;
}
export function identicon(userId: string) {
  let hash = 2166136261;
  for (const character of userId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  const hue = hash % 360;
  const cells = Array.from({ length: 15 }, (_, i) => Boolean((hash >>> i) & 1));
  cells[7] = true;
  return { color: `hsl(${hue} 58% 38%)`, cells };
}
export function UserAvatar({
  userId,
  displayName,
  showName = false,
}: {
  userId: string;
  displayName?: string;
  showName?: boolean;
}) {
  const user = useContext(UserDirectoryContext).find((entry) => entry.id === userId);
  const [failedUrl, setFailedUrl] = useState('');
  const name = user?.displayName ?? displayName ?? userId;
  const avatar = identicon(userId);
  return (
    <span className="user-identity">
      {user?.pictureUrl && failedUrl !== user.pictureUrl ? (
        <img
          className="user-avatar"
          src={user.pictureUrl}
          alt={name}
          onError={() => setFailedUrl(user.pictureUrl!)}
        />
      ) : (
        <svg
          className="user-avatar"
          viewBox="0 0 7 7"
          role="img"
          aria-label={name}
          style={{ background: avatar.color }}
        >
          {avatar.cells.flatMap((filled, index) =>
            filled
              ? [...new Set([index % 3, 4 - (index % 3)])].map((x) => (
                  <rect
                    key={`${index}-${x}`}
                    x={x + 1}
                    y={Math.floor(index / 3) + 1}
                    width="1"
                    height="1"
                    fill="white"
                  />
                ))
              : [],
          )}
        </svg>
      )}
      {showName && <span>{name}</span>}
    </span>
  );
}
