// Safe wrapper — falls back to mock in browser dev mode
const isTauri = typeof window !== "undefined" && window.__TAURI__ !== undefined;

export async function invoke(cmd, args = {}) {
  if (isTauri) {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/tauri");
    return tauriInvoke(cmd, args);
  }
  // Browser mock for UI dev
  console.warn(`[mock] invoke("${cmd}", ${JSON.stringify(args)})`);
  return mockInvoke(cmd, args);
}

function mockInvoke(cmd, args) {
  switch (cmd) {
    case "check_license": return Promise.resolve(false);
    case "check_ollama": return Promise.resolve(false);
    case "list_ollama_models": return Promise.resolve([]);
    case "list_meetings": return Promise.resolve([]);
    case "get_meeting": return Promise.resolve(null);
    case "create_meeting": return Promise.resolve("mock-id-123");
    case "activate_license": return Promise.resolve({ valid: true, message: "Mock activated" });
    default: return Promise.resolve(null);
  }
}
