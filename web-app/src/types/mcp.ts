// MCP (Model Context Protocol) server types
// Maps to goose's ExtensionConfig and ExtensionEntry

export type McpType = 'builtin' | 'platform' | 'stdio' | 'streamable_http' | 'frontend' | 'inline_python';

// goosed API returns flat structure (not nested config)
export interface McpEntry {
  enabled: boolean;
  type: McpType;
  name: string;
  description: string;

  // Display name for builtin types
  display_name?: string;

  // stdio type fields
  cmd?: string;
  args?: string[];
  envs?: Record<string, string>;
  env_keys?: string[];

  // streamable_http type fields
  uri?: string;
  headers?: Record<string, string>;

  // Common fields
  timeout?: number;
  bundled?: boolean;
  available_tools?: string[];
}

export interface McpResponse {
  extensions: McpEntry[];
  warnings: string[];
}

// Request type for adding/updating MCP (uses flat structure like McpEntry)
export interface McpAddRequest {
  name: string;
  enabled: boolean;
  type: McpType;
  description?: string;
  cmd?: string;
  args?: string[];
  envs?: Record<string, string>;
  uri?: string;
  timeout?: number;
}

// Categorized MCP entries for UI display
export interface CategorizedMcpEntries {
  default: McpEntry[];      // bundled + default enabled
  available: McpEntry[];    // bundled + not default enabled
  custom: McpEntry[];       // not bundled (user-added)
}

// Helper to categorize MCP entries
export function categorizeMcpEntries(entries: McpEntry[]): CategorizedMcpEntries {
  const result: CategorizedMcpEntries = {
    default: [],
    available: [],
    custom: [],
  };

  for (const entry of entries) {
    if (!entry.bundled) {
      // User-added custom MCP
      result.custom.push(entry);
    } else if (entry.type === 'platform' || entry.type === 'builtin') {
      // Bundled - check if it's a default-enabled type
      // Default MCPs: developer, memory, todo, skills, extensionmanager
      const defaultMcpNames = ['developer', 'memory', 'todo', 'skills', 'extensionmanager'];
      const isDefault = defaultMcpNames.includes(entry.name.toLowerCase().replace(/\s+/g, ''));

      if (isDefault) {
        result.default.push(entry);
      } else {
        result.available.push(entry);
      }
    } else {
      // Other bundled types go to available
      result.available.push(entry);
    }
  }

  return result;
}

// Get display name for MCP
export function getMcpDisplayName(entry: McpEntry): string {
  if (entry.display_name) {
    return entry.display_name;
  }
  // Capitalize first letter
  return entry.name.charAt(0).toUpperCase() + entry.name.slice(1);
}
