import { createOpencodeClient } from "@opencode-ai/sdk";
import type { Event, OpencodeClient } from "@opencode-ai/sdk";

export type OpencodeState = "idle" | "working" | "blocked" | "offline" | "error";

interface ActionQueueItem {
  actionFn: () => Promise<any>;
  retries: number;
}

export class OpencodeService {
  private client: OpencodeClient;
  private state: OpencodeState = "offline";
  private listeners: Set<(oldState: OpencodeState, newState: OpencodeState) => void> = new Set();
  
  private queue: ActionQueueItem[] = [];
  private isProcessingQueue = false;

  private sessionsStatus: Record<string, "idle" | "working"> = {};
  private sessionPermissions: Record<string, Set<string>> = {};

  private destroyed = false;
  private reconnectTimeout: number | null = null;
  private streamAbortController: AbortController | null = null;

  constructor(private port: number) {
    this.client = createOpencodeClient({ baseUrl: `http://localhost:${this.port}` });
    this.connectLoop();
  }

  public currentState(): OpencodeState {
    return this.state;
  }

  public onStateChange(f: (oldState: OpencodeState, newState: OpencodeState) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  public async waitForState(state: OpencodeState): Promise<void> {
    if (this.state === state && this.queue.length === 0) return;
    return new Promise<void>(resolve => {
      const unsubscribe = this.onStateChange((_, newState) => {
        if (newState === state && this.queue.length === 0) {
          unsubscribe();
          resolve();
        }
      });
    });
  }

  public queueAction(actionFn: () => Promise<any>): void {
    this.queue.push({ actionFn, retries: 0 });
    if (this.state === "idle" && !this.isProcessingQueue) {
      this.processQueue();
    }
  }

  public clearQueue(): void {
    this.queue = [];
    if (this.state === "error") {
      // Transition out of error state and re-evaluate
      this.updateState(true);
    }
  }

  private async processQueue() {
    if (this.isProcessingQueue) return;
    if (this.state !== "idle") return;
    if (this.queue.length === 0) return;

    this.isProcessingQueue = true;
    const item = this.queue[0];

    try {
      await item.actionFn();
      this.queue.shift(); // remove after success
    } catch (e: any) {
      if (item.retries < 1) {
        item.retries++;
        console.warn(`Opencode action failed, retrying in 5s: ${e.message}`);
        await new Promise(r => setTimeout(r, 5000));
      } else {
        console.error(`Opencode action failed after retry: ${e.message}`);
        this.queue = [];
        this.setState("error");
      }
    }

    this.isProcessingQueue = false;
    
    // Only process next if we didn't enter error or offline state
    if (this.state === "idle" && this.queue.length > 0) {
      // Avoid stack overflow, run in next tick
      setTimeout(() => this.processQueue(), 0);
    }
  }

  public async createSessionWithPrompt(prompt: string, config?: { agentMode?: string, model?: string }): Promise<string> {
    const sessionRes = await this.client.session.create({});
    if (sessionRes.error) {
      throw new Error(JSON.stringify(sessionRes.error));
    }
    const sessionId = sessionRes.data.id;
    
    let promptBody = { 
      agent: config?.agentMode || "build", 
      parts: [{ type: "text" as const, text: prompt }],
	  model: undefined as { providerID: string, modelID: string } | undefined,
    }
            
    if (config?.model) {
      const [providerID, ...rest] = config.model.split("/");
      const modelID = rest.join("/");
      if (providerID && modelID) {
        promptBody.model = { providerID, modelID };
      }
    }

    const res = await this.client.session.prompt({
      path: { id: sessionId },
      body: promptBody
    });
    
    if (res.error) {
      throw new Error(JSON.stringify(res.error));
    }
    
    return sessionId;
  }

  public async getLatestSessionId(): Promise<string | null> {
    try {
      const { data: sessions, error } = await this.client.session.list({});
      if (error) {
        throw new Error(JSON.stringify(error));
      }
      return (sessions && sessions.length > 0) ? sessions[0].id : null;
    } catch (e: any) {
      console.error("Failed to fetch opencode sessions:", e.message);
      return null;
    }
  }

  public destroy(): void {
    this.destroyed = true;
    this.queue = [];
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.streamAbortController) {
      this.streamAbortController.abort();
    }
    this.setState("offline");
  }

  private async connectLoop(retryCount = 60, retryDelay = 2000): Promise<void> {
    if (this.destroyed) {
      return;
    }
    
    let connected = false;
    let lastStatus = NaN;
    let lastError = "";

    while (retryCount-- > 0) {
      if (this.destroyed) return;
      
      try {
        const res = await fetch(`http://localhost:${this.port}/global/health`);
        lastStatus = res.status;
        if (res.ok) {
          const data = await res.json();
          if (data.healthy) {
            connected = true;
            if (this.state === "offline") {
              // Force update to recalculate state based on current session statuses
              // if any, otherwise default to idle
              this.updateState(true);
            }
            break;
          }
        }
      } catch (e: any) {
        lastError = e.message;
        // fetch failed, wait and retry
      }
      await new Promise(r => setTimeout(r, retryDelay));
    }

    if (!connected) {
      console.log(`[OpencodeService] health check failed. Last status: ${lastStatus}, Last error: ${lastError}`);
    }

    try {
      this.streamAbortController = new AbortController();
      // SDK might not support AbortSignal explicitly in subscribe but we can handle abort manually
      const events = await this.client.event.subscribe();
      
      for await (const event of events.stream) {
        if (this.destroyed)
          break;
        if (this.streamAbortController.signal.aborted)
          break;
        this.handleEvent(event);
      }
      console.log("[OpencodeService] event stream ended");
    } catch (e: any) {
      console.log(`[OpencodeService] event stream error: ${e.message}`);
      // Event stream closed or failed
    }

    if (!this.destroyed) {
      console.log("[OpencodeService] scheduling reconnect in 2000ms");
      if (this.state !== "error") {
         console.log("[OpencodeService] setting state to offline before reconnect");
         this.setState("offline");
      }
      this.reconnectTimeout = setTimeout(() => this.connectLoop(), 2000);
    } else {
      console.log("[OpencodeService] instance destroyed, not scheduling reconnect");
    }
  }

  private handleEvent(event: Event) {
    if (!event || !event.type) return;
    
    switch (event.type) {
      case "server.connected":
        this.setState("idle", { onlyFromState: "offline" });
        break;
      case "session.status":
        if (event.properties) {
          const { sessionID, status } = event.properties;
          if (sessionID && status) {
            if (status.type === "busy") {
              this.sessionsStatus[sessionID] = "working";
            } else if (status.type === "idle") {
              this.sessionsStatus[sessionID] = "idle";
            }
          }
        }
        break;
      case "session.idle":
        if (event.properties?.sessionID) {
           this.sessionsStatus[event.properties.sessionID] = "idle";
        }
        break;
      case "permission.updated":
        if (event.properties?.sessionID && event.properties?.id) {
           const sid = event.properties.sessionID;
           if (!this.sessionPermissions[sid]) this.sessionPermissions[sid] = new Set();
           this.sessionPermissions[sid].add(event.properties.id);
        }
        break;
      case "permission.replied":
        if (event.properties?.sessionID) {
           const sid = event.properties.sessionID;
           if (this.sessionPermissions[sid]) {
             this.sessionPermissions[sid].delete(event.properties.sessionID);
           }
        }
        break;
    }
    this.updateState();
  }

  private updateState(forceIdleIfEmpty = false) {
    if (this.state === "offline" || this.state === "error") {
      if (!forceIdleIfEmpty) return;
    }
    
    let newState: OpencodeState = "idle";

    for (const perms of Object.values(this.sessionPermissions)) {
      if (perms.size > 0) {
        newState = "blocked";
        break;
      }
    }

    if (newState === "idle") {
      for (const status of Object.values(this.sessionsStatus)) {
        if (status === "working") {
           newState = "working";
           break;
        }
      }
    }

    if (newState !== this.state) {
      this.setState(newState);
    }
  }

  private setState(newState: OpencodeState, params: { onlyFromState?: OpencodeState } = {}) {
    if (this.state === newState)
      return;
    if (params.onlyFromState && this.state !== params.onlyFromState)
      return;
    const oldState = this.state;
    this.state = newState;
    
    for (const listener of this.listeners) {
      try { listener(oldState, newState); } catch(e) {}
    }
    
    if (newState === "idle") {
      this.processQueue();
    }
  }
}

const instances = new Map<number, OpencodeService>();

export function getOpencodeService(port: number): OpencodeService {
  let instance = instances.get(port);
  if (!instance) {
    instance = new OpencodeService(port);
    instances.set(port, instance);
  }
  return instance;
}

export function destroyOpencodeService(port: number): void {
  const instance = instances.get(port);
  if (instance) {
    instance.destroy();
    instances.delete(port);
  }
}
