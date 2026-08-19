/**
 * Tests for PropertyVisibility
 *
 * Focus: a blank alias property name means there is no property to hide, so
 * setup must install no observer and must leave no stale hiding behind.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PropertyVisibility } from '../../src/ui/property-visibility';
import { DeepPartial, PluginSettings } from '../../src/types';
import { DEFAULT_SETTINGS } from '../../src/constants';
import { deepMerge } from '../../src/utils/deep-merge';

function createMockPlugin(settingsOverrides: DeepPartial<PluginSettings> = {}) {
  return {
    settings: deepMerge(DEFAULT_SETTINGS, settingsOverrides),
  } as any;
}

/**
 * Builds the DOM shape Obsidian renders for properties. Two properties, so
 * hiding one takes the individual-property branch rather than the
 * hide-the-whole-container branch reserved for a lone property.
 */
function renderPropertiesMarkup(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'metadata-container';

  const properties = document.createElement('div');
  properties.className = 'metadata-properties';
  container.appendChild(properties);

  for (const key of ['aliases', 'tags']) {
    const property = document.createElement('div');
    property.className = 'metadata-property';
    property.setAttribute('data-property-key', key);

    const value = document.createElement('div');
    value.className = 'metadata-property-value';
    property.appendChild(value);

    properties.appendChild(property);
  }

  document.body.appendChild(container);
  return container;
}

function aliasPropertyEl(): HTMLElement {
  const el = document.querySelector<HTMLElement>(
    '[data-property-key="aliases"]'
  );
  if (!el) throw new Error('alias property element missing');
  return el;
}

describe('PropertyVisibility', () => {
  let propertyVisibility: PropertyVisibility | undefined;

  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    propertyVisibility?.cleanup();
    propertyVisibility = undefined;
    document.body.replaceChildren();
  });

  describe('blank alias property name', () => {
    it('should install no observer', () => {
      propertyVisibility = new PropertyVisibility(
        createMockPlugin({
          aliases: { aliasPropertyKey: '', hideAliasProperty: 'always' },
        })
      );

      propertyVisibility.updatePropertyVisibility();

      expect(propertyVisibility['propertyObserver']).toBeUndefined();
    });

    it('should hide nothing', () => {
      renderPropertiesMarkup();
      propertyVisibility = new PropertyVisibility(
        createMockPlugin({
          aliases: { aliasPropertyKey: '', hideAliasProperty: 'always' },
        })
      );

      propertyVisibility.updatePropertyVisibility();

      expect(aliasPropertyEl().classList.contains('flit-property-hidden')).toBe(
        false
      );
    });

    // Clearing the field while hiding is active goes through this same path, so
    // no separate teardown is needed - the cleanup that already runs at the top
    // of every update un-hides whatever the previous key hid.
    it('should un-hide what a previous key left hidden', () => {
      renderPropertiesMarkup();
      const plugin = createMockPlugin({
        aliases: { aliasPropertyKey: 'aliases', hideAliasProperty: 'always' },
      });
      propertyVisibility = new PropertyVisibility(plugin);

      propertyVisibility.updatePropertyVisibility();
      expect(aliasPropertyEl().classList.contains('flit-property-hidden')).toBe(
        true
      );

      plugin.settings.aliases.aliasPropertyKey = '';
      propertyVisibility.updatePropertyVisibility();

      expect(aliasPropertyEl().classList.contains('flit-property-hidden')).toBe(
        false
      );
      expect(propertyVisibility['propertyObserver']).toBeUndefined();
    });
  });

  describe('with a property name set', () => {
    it('should install an observer and hide the property', () => {
      renderPropertiesMarkup();
      propertyVisibility = new PropertyVisibility(
        createMockPlugin({
          aliases: { aliasPropertyKey: 'aliases', hideAliasProperty: 'always' },
        })
      );

      propertyVisibility.updatePropertyVisibility();

      expect(propertyVisibility['propertyObserver']).toBeDefined();
      expect(aliasPropertyEl().classList.contains('flit-property-hidden')).toBe(
        true
      );
    });

    it('should leave other properties alone', () => {
      renderPropertiesMarkup();
      propertyVisibility = new PropertyVisibility(
        createMockPlugin({
          aliases: { aliasPropertyKey: 'aliases', hideAliasProperty: 'always' },
        })
      );

      propertyVisibility.updatePropertyVisibility();

      const tags = document.querySelector<HTMLElement>(
        '[data-property-key="tags"]'
      );
      expect(tags?.classList.contains('flit-property-hidden')).toBe(false);
    });

    it('should install no observer when hiding is off', () => {
      propertyVisibility = new PropertyVisibility(
        createMockPlugin({
          aliases: { aliasPropertyKey: 'aliases', hideAliasProperty: 'never' },
        })
      );

      propertyVisibility.updatePropertyVisibility();

      expect(propertyVisibility['propertyObserver']).toBeUndefined();
    });
  });
});
