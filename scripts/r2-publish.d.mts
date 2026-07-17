export function publishDirectory(outDir: string, keyPrefix: string, env?: NodeJS.ProcessEnv): Record<string, string>;
export function signedWorkerUrl(baseUrl: string, key: string, secret: string, exp: number | string): string;
export function hmacHex(secret: string, message: string): string;
