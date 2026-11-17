import { spawn } from "node:child_process";

export interface Spawned {
  readonly on: (event: "error", listener: (error: Error) => void) => unknown;
  readonly unref: () => void;
}

export type Spawn = (command: string, args: readonly string[]) => Spawned;

export interface OpenOptions {
  readonly platform: NodeJS.Platform;
  /** `BROWSER`, when set, names the program to use, as many Unix tools allow. */
  readonly env: NodeJS.ProcessEnv;
  readonly run: Spawn;
}

/** The command that opens a URL in the default browser. */
export function openCommand(url: string, { platform, env }: Omit<OpenOptions, "run">): readonly [string, readonly string[]] {
  const browser = env["BROWSER"];
  if (browser !== undefined && browser.length > 0) {
    return [browser, [url]];
  }
  if (platform === "darwin") {
    return ["open", [url]];
  }
  if (platform === "win32") {
    return ["cmd", ["/c", "start", "", url]];
  }
  return ["xdg-open", [url]];
}

/** Starts a program without tying it to this process or its terminal. */
export const detachedSpawn: Spawn = (command, args) => spawn(command, [...args], { detached: true, stdio: "ignore" });

/** Opens `url` in a browser. Resolves `false` when none could be launched. */
export function openInBrowser(url: string, options: OpenOptions): Promise<boolean> {
  const [command, args] = openCommand(url, options);
  return new Promise((resolve) => {
    try {
      const child = options.run(command, args);
      child.on("error", () => {
        resolve(false);
      });
      child.unref();
      setTimeout(() => {
        resolve(true);
      }, 0);
    } catch {
      resolve(false);
    }
  });
}
