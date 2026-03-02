import { normalizePath } from 'obsidian';
import { verboseLog } from '../utils';
import FirstLineIsTitle from '../../main';

interface TypesJson {
  types: Record<string, string>;
}

/**
 * PropertyManager
 *
 * Manages property type registration for frontmatter properties.
 *
 * Responsibilities:
 * - Handle frontmatter property operations
 * - Manage property types in types.json
 */
export class PropertyManager {
  private plugin: FirstLineIsTitle;
  private propertyTypeCache: Map<string, 'checkbox' | 'text' | null> =
    new Map();

  constructor(plugin: FirstLineIsTitle) {
    this.plugin = plugin;
  }

  get app() {
    return this.plugin.app;
  }

  get settings() {
    return this.plugin.settings;
  }

  /**
   * Get path to types.json in vault's .obsidian folder
   */
  private getTypesJsonPath(): string {
    return normalizePath(`${this.app.vault.configDir}/types.json`);
  }

  /**
   * Read types.json file
   *
   * NOTE: Uses Adapter API as necessary exception - types.json is in .obsidian/ config directory
   * and is not a TFile tracked by vault. Vault API only works with indexed vault files.
   */
  private async readTypesJson(): Promise<TypesJson> {
    const path = this.getTypesJsonPath();
    try {
      const content = await this.app.vault.adapter.read(path);
      return JSON.parse(content);
    } catch {
      // If file doesn't exist or is invalid, return empty structure
      verboseLog(
        this.plugin,
        `types.json not found or invalid, creating new structure`
      );
      return { types: {} };
    }
  }

  /**
   * Write types.json file
   *
   * NOTE: Uses Adapter API as necessary exception - types.json is in .obsidian/ config directory
   * and is not a TFile tracked by vault. Vault API only works with indexed vault files.
   */
  private async writeTypesJson(data: TypesJson): Promise<void> {
    const path = this.getTypesJsonPath();
    try {
      const content = JSON.stringify(data, null, 2);
      await this.app.vault.adapter.write(path, content);
      verboseLog(this.plugin, `Updated types.json`);
    } catch (error) {
      console.error('Failed to write types.json:', error);
    }
  }

  /**
   * Normalize property values to their actual types
   * Converts string representations to boolean, null, or number as appropriate
   */
  static normalizePropertyValue(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (value !== '' && !isNaN(Number(value))) {
      return Number(value);
    }
    return value;
  }

  /**
   * Check if value is boolean (true or false)
   */
  private isBooleanValue(value: unknown): boolean {
    return (
      value === true || value === false || value === 'true' || value === 'false'
    );
  }

  /**
   * Normalize boolean values to actual boolean type
   */
  private normalizeBooleanValue(value: unknown): boolean {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value as boolean;
  }

  /**
   * Ensure property type is set to checkbox in types.json
   * Call this when "Disable renaming" commands are executed
   *
   * This ensures the property type is always checkbox when the property value is boolean,
   * regardless of what type it was before or if it existed at all.
   */
  async ensurePropertyTypeIsCheckbox(): Promise<void> {
    const propertyKey = this.settings.exclusions.disableRenamingKey;
    const propertyValue = this.settings.exclusions.disableRenamingValue;

    if (!propertyKey) return;

    // Only set to checkbox if the value is boolean
    const normalizedValue = this.normalizeBooleanValue(propertyValue);
    const isBoolean = this.isBooleanValue(normalizedValue);

    if (!isBoolean) {
      verboseLog(
        this.plugin,
        `Property "${propertyKey}" value is not boolean (${propertyValue}), skipping type update`
      );
      return;
    }

    // Read current types.json
    const typesData = await this.readTypesJson();
    const currentType = typesData.types[propertyKey];

    // Set as checkbox if not already
    if (currentType !== 'checkbox') {
      typesData.types[propertyKey] = 'checkbox';
      await this.writeTypesJson(typesData);
      verboseLog(
        this.plugin,
        `Property "${propertyKey}" set to checkbox for disable renaming command`
      );
    }

    // Update cache
    this.propertyTypeCache.set(propertyKey, 'checkbox');
  }
}
