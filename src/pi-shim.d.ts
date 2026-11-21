declare module "@earendil-works/pi-coding-agent" {
  export interface ExtensionAPI {
    registerTool(config: any): void;
    registerCommand(name: string, config: any): void;
    on(event: string, handler: (...args: any[]) => any): void;
  }
}
