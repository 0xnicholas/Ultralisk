export type DeploymentMode = 'saas' | 'private';

let cachedMode: DeploymentMode | null = null;

function detectMode(): DeploymentMode {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DEPLOYMENT_MODE) {
    return (import.meta as any).env.VITE_DEPLOYMENT_MODE as DeploymentMode;
  }
  if (typeof window !== 'undefined') {
    const runtimeMode = (window as any).__DEPLOYMENT_MODE;
    if (runtimeMode && runtimeMode !== '__DEPLOYMENT_MODE__') {
      return runtimeMode as DeploymentMode;
    }
  }
  return 'saas';
}

export function getDeploymentMode(): DeploymentMode {
  if (!cachedMode) cachedMode = detectMode();
  return cachedMode;
}

export function isSaaS(): boolean {
  return getDeploymentMode() === 'saas';
}

export function isPrivate(): boolean {
  return getDeploymentMode() === 'private';
}
