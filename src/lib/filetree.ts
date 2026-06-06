export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

export function generateFileTree(files: Map<string, string>): FileNode[] {
  const root: FileNode[] = [];
  const folderMap = new Map<string, FileNode>();

  const sortedPaths = Array.from(files.keys()).sort();

  for (const filePath of sortedPaths) {
    const parts = filePath.split('/').filter(Boolean);
    let currentChildren = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join('/');

      if (isFile) {
        currentChildren.push({
          name: part,
          path: fullPath,
          type: 'file',
        });
      } else {
        let folder = currentChildren.find(
          (n) => n.type === 'folder' && n.name === part
        );
        if (!folder) {
          folder = { name: part, path: fullPath, type: 'folder', children: [] };
          currentChildren.push(folder);
          folderMap.set(fullPath, folder);
        }
        currentChildren = folder!.children!;
      }
    }
  }

  sortNodes(root);
  return root;
}

function sortNodes(nodes: FileNode[]): void {
  nodes.sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.children) sortNodes(node.children);
  }
}
