import { Setting, SettingGroup, Notice } from 'obsidian';
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { MarkupStrippingSettings } from '../types';
import { t, getCurrentLocale } from '../i18n';

export class StripMarkupTab extends SettingsTabBase {
  constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
    super(plugin, containerEl);
  }

  render(): void {
    type MarkupStrippingKeys = keyof MarkupStrippingSettings;
    type StripMarkupSettingsKeys =
      keyof MarkupStrippingSettings['stripMarkupSettings'];

    // Main toggle (not part of group)
    const mainToggleSetting = new Setting(this.containerEl)
      .setName(t('settings.stripMarkup.name'))
      .setDesc(t('settings.stripMarkup.desc'))
      .setHeading()
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.markupStripping.enableStripMarkup)
          .onChange(async (value) => {
            this.plugin.settings.markupStripping.enableStripMarkup = value;
            this.plugin.debugLog('enableStripMarkup', value);

            if (!value) {
              if (this.plugin.settings.markupStripping.stripMarkupInAlias) {
                this.plugin.settings.markupStripping.stripMarkupInAlias = false;
              }
              if (
                this.plugin.settings.markupStripping
                  .applyCustomRulesAfterMarkupStripping
              ) {
                this.plugin.settings.markupStripping.applyCustomRulesAfterMarkupStripping = false;
              }
            }

            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
            updateStripMarkupUI();
            void (
              this.plugin as typeof this.plugin & {
                updateAliasConditionalSettings?: () => Promise<void>;
              }
            ).updateAliasConditionalSettings?.();
          });
      });

    // Style the main toggle as a heading
    mainToggleSetting.settingEl.addClass('flit-master-toggle');

    new SettingGroup(this.containerEl).addClass('flit-strip-markup-group');

    // Get the setting-items container
    const stripMarkupContainer = this.containerEl.querySelector<HTMLElement>(
      '.flit-strip-markup-group .setting-items'
    );
    if (!stripMarkupContainer) {
      console.error('FLIT: Failed to find strip-markup settings container');
      return;
    }

    const updateStripMarkupUI = () => {
      this.updateInteractiveState(
        stripMarkupContainer,
        this.plugin.settings.markupStripping.enableStripMarkup
      );
      this.updateDisabledRowsAccessibility(stripMarkupContainer);
    };
    const markupToggles = [
      { key: 'headings' },
      { key: 'bold' },
      { key: 'italic' },
      { key: 'strikethrough' },
      { key: 'highlight' },
      { key: 'wikilinks' },
      { key: 'markdownLinks' },
      { key: 'quote' },
      { key: 'callouts' },
      { key: 'unorderedLists' },
      { key: 'orderedLists' },
      { key: 'taskLists' },
      { key: 'stripHorizontalRuleMarkup', isCustom: true },
      { key: 'code' },
      { key: 'codeBlocks' },
      { key: 'footnotes' },
      { key: 'comments' },
      { key: 'stripTableMarkup', isCustom: true },
      { key: 'stripInlineMathMarkup', isCustom: true },
      { key: 'stripMathBlockMarkup', isCustom: true },
      { key: 'htmlTags' },
    ];

    let stripCommentsEntirelyContainer: HTMLElement;

    const updateStripCommentsEntirelyVisibility = () => {
      if (this.plugin.settings.markupStripping.stripMarkupSettings.comments) {
        stripCommentsEntirelyContainer.show();
      } else {
        stripCommentsEntirelyContainer.hide();
      }
    };

    let detectDiagramsContainer: HTMLElement;

    const updateDetectDiagramsVisibility = () => {
      if (this.plugin.settings.markupStripping.stripMarkupSettings.codeBlocks) {
        detectDiagramsContainer.show();
      } else {
        detectDiagramsContainer.hide();
      }
    };

    markupToggles.forEach((toggle) => {
      const setting = new Setting(stripMarkupContainer)
        .setName(t(`settings.stripMarkup.${toggle.key}.name`))
        .setDesc('');
      const desc = setting.descEl;
      const isRussian = getCurrentLocale() === 'ru';
      const descKey = `settings.stripMarkup.${toggle.key}.desc`;
      const part1Key = `${descKey}.part1`;
      const part1Value = t(part1Key);
      if (part1Value !== part1Key) {
        let index = 1;

        while (true) {
          let foundAny = false;
          const partKey = `${descKey}.part${index}`;
          const partValue = t(partKey);
          if (partValue !== partKey) {
            desc.appendText(partValue);
            foundAny = true;
          }
          const exampleKey = `${descKey}.example${index}`;
          const exampleValue = t(exampleKey);
          if (exampleValue !== exampleKey) {
            desc.createEl('code', { text: exampleValue });
            foundAny = true;
          }
          if (index === 1) {
            const specialKeys = ['table', 'mathBlock'];
            for (const specialKey of specialKeys) {
              const fullKey = `${descKey}.${specialKey}`;
              const specialValue = t(fullKey);
              if (specialValue !== fullKey) {
                if (isRussian) {
                  desc.appendText('«' + specialValue + '»');
                } else {
                  desc.createEl('em', { text: specialValue });
                }
                foundAny = true;
                break;
              }
            }
          }

          if (!foundAny) break;
          index++;
        }
      } else {
        desc.appendText(t(descKey));
      }

      setting.addToggle((toggleControl) => {
        // Custom property added by plugin, not in Obsidian's Toggle interface
        if ((toggle as { isCustom?: boolean }).isCustom) {
          toggleControl
            .setValue(
              this.plugin.settings.markupStripping[
                toggle.key as MarkupStrippingKeys
              ] as boolean
            )
            .onChange(async (value) => {
              (this.plugin.settings.markupStripping[
                toggle.key as MarkupStrippingKeys
              ] as boolean) = value;
              this.plugin.debugLog(toggle.key, value);
              try {
                await this.plugin.saveSettings();
              } catch {
                new Notice(t('settings.errors.saveFailed'));
              }
            });
        } else {
          toggleControl
            .setValue(
              this.plugin.settings.markupStripping.stripMarkupSettings[
                toggle.key as StripMarkupSettingsKeys
              ]
            )
            .onChange(async (value) => {
              this.plugin.settings.markupStripping.stripMarkupSettings[
                toggle.key as StripMarkupSettingsKeys
              ] = value;
              this.plugin.debugLog(`stripMarkupSettings.${toggle.key}`, value);
              try {
                await this.plugin.saveSettings();
              } catch {
                new Notice(t('settings.errors.saveFailed'));
              }
              if (toggle.key === 'comments') {
                updateStripCommentsEntirelyVisibility();
              }
              if (toggle.key === 'codeBlocks') {
                updateDetectDiagramsVisibility();
              }
            });
        }
      });
      if (toggle.key === 'comments') {
        const stripCommentsEntirelySetting = new Setting(stripMarkupContainer)
          .setName(t('settings.stripMarkup.commentsEntirely.name'))
          .setDesc(t('settings.stripMarkup.commentsEntirely.desc'))
          .addToggle((toggle) =>
            toggle
              .setValue(
                this.plugin.settings.markupStripping.stripCommentsEntirely
              )
              .onChange(async (value) => {
                this.plugin.settings.markupStripping.stripCommentsEntirely =
                  value;
                this.plugin.debugLog('stripCommentsEntirely', value);
                try {
                  await this.plugin.saveSettings();
                } catch {
                  new Notice(t('settings.errors.saveFailed'));
                }
              })
          );

        stripCommentsEntirelyContainer =
          stripMarkupContainer.createDiv('flit-sub-settings');
        stripCommentsEntirelyContainer.appendChild(
          stripCommentsEntirelySetting.settingEl
        );

        updateStripCommentsEntirelyVisibility();
      }
      if (toggle.key === 'codeBlocks') {
        const detectDiagramsSetting = new Setting(stripMarkupContainer)
          .setName(t('settings.stripMarkup.detectDiagrams.name'))
          .setDesc('');
        const desc = detectDiagramsSetting.descEl;
        const isRussian = getCurrentLocale() === 'ru';
        const descKey = 'settings.stripMarkup.detectDiagrams.desc';
        const part1Key = `${descKey}.part1`;
        const part1Value = t(part1Key);

        if (part1Value !== part1Key) {
          let index = 1;
          while (true) {
            let foundAny = false;

            const partKey = `${descKey}.part${index}`;
            const partValue = t(partKey);
            if (partValue !== partKey) {
              desc.appendText(partValue);
              foundAny = true;
            }
            if (index === 1) {
              const specialKeys = ['diagram'];
              for (const specialKey of specialKeys) {
                const fullKey = `${descKey}.${specialKey}`;
                const specialValue = t(fullKey);
                if (specialValue !== fullKey) {
                  if (isRussian) {
                    desc.appendText('«' + specialValue + '»');
                  } else {
                    desc.createEl('em', { text: specialValue });
                  }
                  foundAny = true;
                  break;
                }
              }
            }

            if (!foundAny) break;
            index++;
          }
        }

        detectDiagramsSetting.addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.markupStripping.detectDiagrams)
            .onChange(async (value) => {
              this.plugin.settings.markupStripping.detectDiagrams = value;
              this.plugin.debugLog('detectDiagrams', value);
              try {
                await this.plugin.saveSettings();
              } catch {
                new Notice(t('settings.errors.saveFailed'));
              }
            })
        );

        detectDiagramsContainer =
          stripMarkupContainer.createDiv('flit-sub-settings');
        detectDiagramsContainer.appendChild(detectDiagramsSetting.settingEl);

        updateDetectDiagramsVisibility();
      }
    });

    const templaterSetting = new Setting(stripMarkupContainer)
      .setName(t('settings.stripMarkup.templater.name'))
      .setDesc('');
    const templaterDesc = templaterSetting.descEl;
    templaterDesc.appendText(t('settings.stripMarkup.templater.desc.part1'));
    templaterDesc.createEl('a', {
      text: 'Templater',
      href: 'obsidian://show-plugin?id=templater-obsidian',
    });
    templaterDesc.appendText(t('settings.stripMarkup.templater.desc.part2'));
    templaterDesc.createEl('code', {
      text: t('settings.stripMarkup.templater.desc.code'),
    });
    templaterDesc.appendText(t('settings.stripMarkup.templater.desc.part3'));

    templaterSetting.addToggle((toggle) =>
      toggle
        .setValue(this.plugin.settings.markupStripping.stripTemplaterSyntax)
        .onChange(async (value) => {
          this.plugin.settings.markupStripping.stripTemplaterSyntax = value;
          this.plugin.debugLog('stripTemplaterSyntax', value);
          try {
            await this.plugin.saveSettings();
          } catch {
            new Notice(t('settings.errors.saveFailed'));
          }
        })
    );

    updateStripMarkupUI();
  }
}
