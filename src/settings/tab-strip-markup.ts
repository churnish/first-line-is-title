import { SettingDefinitionItem, SettingDefinitionPage } from 'obsidian';
import { FirstLineIsTitlePlugin } from './settings-base';
import { t, getCurrentLocale } from '../i18n';
import { createPluginLink, buildPluginLinkRouterGroup } from './plugin-links';

/**
 * A markup-type toggle: `id` is the locale namespace under
 * `settings.stripMarkup.`, `path` the dot-path under `markupStripping.`.
 */
interface MarkupToggle {
  id: string;
  path: string;
}

/**
 * Source order matters — it is the display order, and the two conditional
 * sub-settings are inserted directly after their parent toggle.
 */
const MARKUP_TOGGLES: MarkupToggle[] = [
  { id: 'headings', path: 'stripMarkupSettings.headings' },
  { id: 'bold', path: 'stripMarkupSettings.bold' },
  { id: 'italic', path: 'stripMarkupSettings.italic' },
  { id: 'strikethrough', path: 'stripMarkupSettings.strikethrough' },
  { id: 'highlight', path: 'stripMarkupSettings.highlight' },
  { id: 'wikilinks', path: 'stripMarkupSettings.wikilinks' },
  { id: 'markdownLinks', path: 'stripMarkupSettings.markdownLinks' },
  { id: 'quote', path: 'stripMarkupSettings.quote' },
  { id: 'callouts', path: 'stripMarkupSettings.callouts' },
  { id: 'unorderedLists', path: 'stripMarkupSettings.unorderedLists' },
  { id: 'orderedLists', path: 'stripMarkupSettings.orderedLists' },
  { id: 'taskLists', path: 'stripMarkupSettings.taskLists' },
  { id: 'stripHorizontalRuleMarkup', path: 'stripHorizontalRuleMarkup' },
  { id: 'code', path: 'stripMarkupSettings.code' },
  { id: 'codeBlocks', path: 'stripMarkupSettings.codeBlocks' },
  { id: 'footnotes', path: 'stripMarkupSettings.footnotes' },
  { id: 'comments', path: 'stripMarkupSettings.comments' },
  { id: 'stripTableMarkup', path: 'stripTableMarkup' },
  { id: 'stripInlineMathMarkup', path: 'stripInlineMathMarkup' },
  { id: 'stripMathBlockMarkup', path: 'stripMathBlockMarkup' },
  { id: 'htmlTags', path: 'stripMarkupSettings.htmlTags' },
];

/**
 * Terms that some descriptions bold (or quote, in Russian) instead of
 * rendering as a code sample. Only ever one per description, always in part 1.
 */
const EMPHASISED_TERM_KEYS = ['table', 'mathBlock', 'diagram'];

/**
 * Assembles a description from numbered locale fragments: `desc.part{N}` runs
 * of prose interleaved with `desc.example{N}` code samples, plus an optional
 * emphasised term after part 1. Falls back to the flat `desc` key when no
 * numbered parts exist.
 */
function buildMultiPartDescription(descKey: string): DocumentFragment {
  return createFragment((frag) => {
    const part1Key = `${descKey}.part1`;
    if (t(part1Key) === part1Key) {
      frag.appendText(t(descKey));
      return;
    }

    const isRussian = getCurrentLocale() === 'ru';
    let index = 1;
    for (;;) {
      let foundAny = false;

      const partKey = `${descKey}.part${index}`;
      const partValue = t(partKey);
      if (partValue !== partKey) {
        frag.appendText(partValue);
        foundAny = true;
      }

      const exampleKey = `${descKey}.example${index}`;
      const exampleValue = t(exampleKey);
      if (exampleValue !== exampleKey) {
        frag.createEl('code', { text: exampleValue });
        foundAny = true;
      }

      if (index === 1) {
        for (const termKey of EMPHASISED_TERM_KEYS) {
          const fullKey = `${descKey}.${termKey}`;
          const termValue = t(fullKey);
          if (termValue !== fullKey) {
            if (isRussian) {
              frag.appendText('«' + termValue + '»');
            } else {
              frag.createEl('strong', { text: termValue });
            }
            foundAny = true;
            break;
          }
        }
      }

      if (!foundAny) break;
      index++;
    }
  });
}

/** Description for the Templater toggle — a link plus an inline code sample. */
function buildTemplaterDescription(): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(t('settings.stripMarkup.templater.desc.part1'));
    createPluginLink(frag, 'templater-obsidian', 'Templater');
    frag.appendText(t('settings.stripMarkup.templater.desc.part2'));
    frag.createEl('code', {
      text: t('settings.stripMarkup.templater.desc.code'),
    });
    frag.appendText(t('settings.stripMarkup.templater.desc.part3'));
  });
}

export function buildMarkupStrippingPage(
  plugin: FirstLineIsTitlePlugin
): SettingDefinitionPage {
  const items: SettingDefinitionItem[] = [];

  for (const toggle of MARKUP_TOGGLES) {
    items.push({
      name: t(`settings.stripMarkup.${toggle.id}.name`),
      desc: buildMultiPartDescription(`settings.stripMarkup.${toggle.id}.desc`),
      control: {
        type: 'toggle',
        key: `markupStripping.${toggle.path}`,
      },
    });

    if (toggle.id === 'codeBlocks') {
      items.push({
        name: t('settings.stripMarkup.detectDiagrams.name'),
        desc: buildMultiPartDescription(
          'settings.stripMarkup.detectDiagrams.desc'
        ),
        visible: () =>
          plugin.settings.markupStripping.stripMarkupSettings.codeBlocks,
        control: {
          type: 'toggle',
          key: 'markupStripping.detectDiagrams',
        },
      });
    }

    if (toggle.id === 'comments') {
      items.push({
        name: t('settings.stripMarkup.commentsEntirely.name'),
        desc: t('settings.stripMarkup.commentsEntirely.desc'),
        visible: () =>
          plugin.settings.markupStripping.stripMarkupSettings.comments,
        control: {
          type: 'toggle',
          key: 'markupStripping.stripCommentsEntirely',
        },
      });
    }
  }

  items.push({
    name: t('settings.stripMarkup.templater.name'),
    desc: buildTemplaterDescription(),
    control: {
      type: 'toggle',
      key: 'markupStripping.stripTemplaterSyntax',
    },
  });

  items.push(buildPluginLinkRouterGroup(plugin.app));

  return {
    type: 'page',
    name: t('settings.tabs.stripMarkup'),
    desc: t('settings.stripMarkup.desc'),
    items,
  };
}
