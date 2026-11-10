export interface LayoutOptions {
  env?: NodeJS.ProcessEnv;
  platform?: string;
  home?: string;
  target?: string;
  projectRoot?: string;
}
export function dataRoot(options?: LayoutOptions): string;
export function componentDirectory(component: 'client' | 'node', options?: LayoutOptions): string;
export function desktopLayout(
  bundled: boolean,
  options?: LayoutOptions
): { root: string; base: string; client: string; node: string; userData: string };
export function acquireDataLock(directory: string): () => void;
export function cleanData(component: 'client' | 'node', options?: LayoutOptions): void;
export function prepareData(
  component: 'client' | 'node',
  options?: LayoutOptions
): Promise<() => void>;
