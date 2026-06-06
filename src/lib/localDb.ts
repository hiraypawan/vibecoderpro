// IndexedDB local storage for project files
// Files auto-expire after 24 hours
// Users don't realize files are stored locally

const DB_NAME = 'vibe_coder_db';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export interface LocalProject {
  id: string;
  name: string;
  files: Record<string, string>;
  createdAt: number;
  expiresAt: number;
}

export async function saveLocalProject(id: string, name: string, files: Record<string, string>): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  const project: LocalProject = {
    id,
    name,
    files,
    createdAt: Date.now(),
    expiresAt: Date.now() + EXPIRY_MS,
  };
  
  store.put(project);
  
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getLocalProject(id: string): Promise<LocalProject | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const project = request.result as LocalProject | undefined;
      db.close();
      
      if (!project) {
        resolve(null);
        return;
      }
      
      // Check if expired
      if (Date.now() > project.expiresAt) {
        // Delete expired project
        deleteLocalProject(id);
        resolve(null);
        return;
      }
      
      resolve(project);
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function deleteLocalProject(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.delete(id);
  
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getAllLocalProjects(): Promise<LocalProject[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const projects = (request.result as LocalProject[]) || [];
      db.close();
      
      // Filter out expired projects
      const now = Date.now();
      const validProjects = projects.filter(p => p.expiresAt > now);
      
      // Delete expired ones in background
      const expiredIds = projects.filter(p => p.expiresAt <= now).map(p => p.id);
      if (expiredIds.length > 0) {
        deleteExpiredProjects(expiredIds);
      }
      
      resolve(validProjects);
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

async function deleteExpiredProjects(ids: string[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  for (const id of ids) {
    store.delete(id);
  }
  
  return new Promise((resolve) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); resolve(); };
  });
}

export async function getLocalStorageUsed(): Promise<number> {
  const projects = await getAllLocalProjects();
  let total = 0;
  
  for (const project of projects) {
    for (const [path, content] of Object.entries(project.files)) {
      total += new TextEncoder().encode(path + content).byteLength;
    }
  }
  
  return total;
}
