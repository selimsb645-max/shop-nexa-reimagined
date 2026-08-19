declare global {
  const Deno: {
    env: {
      get(name: string): string | undefined;
    };
    readTextFileSync(path: string): string;
    writeTextFileSync(path: string, data: string): void;
    readFile(path: string): Promise<Uint8Array>;
    writeFile(path: string, data: Uint8Array): Promise<void>;
  };
}
export {};
