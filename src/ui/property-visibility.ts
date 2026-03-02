import { PluginSettings } from '../types';
import FirstLineIsTitle from '../../main';

export class PropertyVisibility {
  private propertyObserver?: MutationObserver;

  constructor(private plugin: FirstLineIsTitle) {}

  get settings(): PluginSettings {
    return this.plugin.settings;
  }

  /**
   * Parse comma-separated property keys from settings
   * @returns Array of property keys, defaults to ['aliases'] if empty
   */
  private getAliasPropertyKeys(): string[] {
    const aliasPropertyKey =
      this.settings.aliases.aliasPropertyKey || 'aliases';
    return aliasPropertyKey
      .split(',')
      .map((key) => key.trim())
      .filter((key) => key.length > 0);
  }

  /**
   * Sets up property hiding for specified property keys using DOM observation
   */
  private setupPropertyHiding(propertyKeys: string[]): void {
    this.cleanupPropertyObserver();

    this.propertyObserver = new MutationObserver((mutations) => {
      mutations.forEach(() => {
        propertyKeys.forEach((propertyKey) => {
          this.hideProperties(propertyKey);
        });
      });
    });

    this.propertyObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-property-key'],
    });

    propertyKeys.forEach((propertyKey) => {
      this.hideProperties(propertyKey);
    });
  }

  /**
   * Hides properties based on current settings and context
   */
  private hideProperties(propertyKey: string): void {
    const properties = document.querySelectorAll(
      `[data-property-key="${propertyKey}"]`
    );

    properties.forEach((property) => {
      // Skip if in source view (check for CodeMirror editor context)
      const isInSourceView =
        property.closest('.cm-editor') &&
        !property.closest('.metadata-container');
      if (isInSourceView) {
        return;
      }

      // Detect context: sidebar vs in-note
      // Sidebar properties are typically in workspace-leaf-content but NOT in markdown views
      const isInSidebar =
        property.closest('.workspace-leaf-content') &&
        !property.closest('.workspace-leaf-content[data-type="markdown"]') &&
        !property.closest('.markdown-source-view') &&
        !property.closest('.markdown-preview-view');

      // Determine if this property should be hidden based on the mode and context
      let shouldHide = false;

      if (this.settings.aliases.hideAliasProperty === 'always') {
        // Always hide, regardless of emptiness, but consider sidebar setting
        if (isInSidebar && !this.settings.aliases.hideAliasInSidebar) {
          // In sidebar but sidebar hiding is disabled - don't hide
          shouldHide = false;
        } else {
          // Either not in sidebar, or sidebar hiding is enabled - hide it
          shouldHide = true;
        }
      } else if (this.settings.aliases.hideAliasProperty === 'when_empty') {
        // Only hide if property is empty, and consider sidebar setting
        const valueContainer = property.querySelector(
          '.metadata-property-value'
        );
        const isEmpty =
          !valueContainer ||
          valueContainer.textContent?.trim() === '' ||
          valueContainer.children.length === 0;

        if (isEmpty) {
          if (isInSidebar && !this.settings.aliases.hideAliasInSidebar) {
            // In sidebar but sidebar hiding is disabled - don't hide even if empty
            shouldHide = false;
          } else {
            // Either not in sidebar, or sidebar hiding is enabled - hide it
            shouldHide = true;
          }
        } else {
          // Not empty - don't hide
          shouldHide = false;
        }
      }

      const metadataContainer = property.closest('.metadata-container');
      const metadataProperties = property.closest('.metadata-properties');

      if (shouldHide) {
        // Property should be hidden - apply context-specific logic
        if (metadataProperties) {
          const allProperties = metadataProperties.querySelectorAll(
            '.metadata-property[data-property-key]'
          );

          if (allProperties.length === 1 && allProperties[0] === property) {
            // This is the only property and it should be hidden
            if (isInSidebar) {
              // SIDEBAR: Only hide .metadata-properties, preserve "Add property" button
              metadataProperties.addClass('flit-container-hidden');
              metadataProperties.removeClass('flit-container-visible');
            } else {
              // IN-NOTE: Hide entire .metadata-container including "Add property" button
              if (metadataContainer) {
                metadataContainer.addClass('flit-container-hidden');
                metadataContainer.removeClass('flit-container-visible');
              } else {
                // Fallback if no container found
                metadataProperties.addClass('flit-container-hidden');
                metadataProperties.removeClass('flit-container-visible');
              }
            }
          } else {
            // There are other properties - hide this individual property
            property.addClass('flit-property-hidden');
            property.removeClass('flit-property-visible');

            // Check if ALL properties are now hidden
            const visibleProperties = metadataProperties.querySelectorAll(
              '.metadata-property[data-property-key]:not(.flit-property-hidden)'
            );

            if (visibleProperties.length === 0) {
              // All properties hidden - hide the entire container
              if (isInSidebar) {
                metadataProperties.addClass('flit-container-hidden');
                metadataProperties.removeClass('flit-container-visible');
              } else {
                if (metadataContainer) {
                  metadataContainer.addClass('flit-container-hidden');
                  metadataContainer.removeClass('flit-container-visible');
                }
              }
            } else {
              // Some properties still visible - ensure container visible
              metadataProperties.removeClass('flit-container-hidden');
              metadataProperties.addClass('flit-container-visible');
              if (metadataContainer) {
                metadataContainer.removeClass('flit-container-hidden');
                metadataContainer.addClass('flit-container-visible');
              }
            }
          }
        } else {
          // Fallback: just hide the individual property
          property.addClass('flit-property-hidden');
          property.removeClass('flit-property-visible');
        }
      } else {
        // Property should be shown
        property.removeClass('flit-property-hidden');
        property.addClass('flit-property-visible');

        // Ensure containers are visible since we have a property that should be shown
        if (metadataProperties) {
          metadataProperties.removeClass('flit-container-hidden');
          metadataProperties.addClass('flit-container-visible');
        }
        if (metadataContainer) {
          metadataContainer.removeClass('flit-container-hidden');
          metadataContainer.addClass('flit-container-visible');
        }
      }
    });
  }

  /**
   * Cleans up the property observer and restores any hidden elements
   */
  private cleanupPropertyObserver(): void {
    if (this.propertyObserver) {
      this.propertyObserver.disconnect();
      this.propertyObserver = undefined;
    }

    const hiddenProperties = document.querySelectorAll('.flit-property-hidden');
    hiddenProperties.forEach((property) => {
      property.removeClass('flit-property-hidden');
      property.addClass('flit-property-visible');
    });

    const hiddenContainers = document.querySelectorAll(
      '.flit-container-hidden'
    );
    hiddenContainers.forEach((container) => {
      container.removeClass('flit-container-hidden');
      container.addClass('flit-container-visible');
    });
  }

  /**
   * Updates property visibility based on current settings
   */
  updatePropertyVisibility(): void {
    document.head.querySelector('#flit-hide-property-style')?.remove();

    this.cleanupPropertyObserver();

    if (this.settings.aliases.hideAliasProperty === 'never') {
      return; // No hiding needed
    }

    const propertyKeys = this.getAliasPropertyKeys();

    if (
      this.settings.aliases.hideAliasProperty === 'always' ||
      this.settings.aliases.hideAliasProperty === 'when_empty'
    ) {
      // Use DOM observation for both modes to handle container hiding properly
      this.setupPropertyHiding(propertyKeys);
    }
  }

  /**
   * Cleans up all property visibility related observers and styles
   */
  cleanup(): void {
    this.cleanupPropertyObserver();
  }
}
