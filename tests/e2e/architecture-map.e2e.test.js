import { test, expect } from './support/fixtures.js';
import { PageHealth } from './support/page-health.js';
import { DictionaryText } from './support/dictionary-text.js';
import { Diagram } from '../../source/js/architecture-map/diagram.js';

const PT_BR = DictionaryText.of('pt-BR');
const EN_US = DictionaryText.of('en-US');
const NODE_IDS = Object.keys(Diagram.NODES);
const STEPS_WITH_CAPTION = Diagram.walkthrough().filter((step) => step.caption);

test.describe('architecture map', () => {
  test('draws every node and every edge of the diagram, with the titles from the dictionary', async ({
    site,
    health,
  }) => {
    await site.open('/');
    await expect(site.architectureNodes).toHaveCount(NODE_IDS.length + 1); // the nodes and the Kafka bus
    await expect(site.architectureEdges).toHaveCount(Diagram.edges().length);
    await expect(
      site.page.locator('#architecture-svg g.node:not(.event-bus) .node-title'),
    ).toHaveText(NODE_IDS.map((id) => PT_BR.architecture.nodes[id].title));
    await expect(site.architectureNode('bus').locator('.node-title')).toHaveText('Kafka');
    await expect(site.page.locator('#architecture-svg')).toHaveAttribute(
      'aria-label',
      PT_BR.architecture.map,
    );
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('retitles every node when the language changes', async ({ site }) => {
    await site.open('/');
    await site.localeLink('en-US').click();
    await expect(
      site.page.locator('#architecture-svg g.node:not(.event-bus) .node-title'),
    ).toHaveText(NODE_IDS.map((id) => EN_US.architecture.nodes[id].title));
    await expect(site.page.locator('#architecture-svg')).toHaveAttribute(
      'aria-label',
      EN_US.architecture.map,
    );
  });

  test('hovering a storage node explains it, and leaving hides the explanation', async ({
    site,
  }) => {
    test.skip(site.page.viewportSize().width < 900, 'hover is for fine pointers');
    await site.open('/');
    await site.centerOn('#architecture');
    await expect(site.architectureTooltip).toBeHidden();
    await site.architectureNode('postgres').hover();
    await expect(site.architectureTooltip).toHaveText(
      PT_BR.architecture.nodes.postgres.title + PT_BR.architecture.nodes.postgres.description,
    );
    await expect(site.architectureNode('postgres')).toHaveClass('node node-storage is-active');
    await site.page.mouse.move(2, 400);
    await expect(site.architectureTooltip).toBeHidden();
  });

  test('hovering the bus names the topics', async ({ site }) => {
    test.skip(site.page.viewportSize().width < 900, 'hover is for fine pointers');
    await site.open('/');
    await site.centerOn('#architecture');
    await site.architectureNode('bus').hover();
    await expect(site.architectureTooltip).toHaveText(
      `Kafka${PT_BR.architecture.bus}${Diagram.TOPICS.join(' · ')}`,
    );
  });

  test('hovering a service shows its replicas against the maximum of the diagram', async ({
    site,
  }) => {
    test.skip(site.page.viewportSize().width < 900, 'hover is for fine pointers');
    await site.open('/');
    await site.centerOn('#architecture');
    await site.architectureNode('ledger').hover();
    await expect(site.architectureTooltip.locator('b')).toHaveText(
      PT_BR.architecture.nodes.ledger.title,
    );
    // The load figures come from a live simulation; the template and the replica ceiling do not.
    const stats = await site.architectureTooltip.locator('span').textContent();
    const values = DictionaryText.extract(PT_BR.architecture.tooltip, stats);
    expect(DictionaryText.plain(PT_BR.architecture.tooltip, values)).toBe(stats);
    expect(values.max).toBe(String(Diagram.NODES.ledger.maxReplicas));
  });

  test('follow a Pix: narrates every captioned step in order, then ends with the closing caption', async ({
    site,
    page,
    health,
  }) => {
    test.setTimeout(90_000);
    await site.open('/');
    await site.centerOn('#architecture'); // the map's render loop only runs while the map is on screen, and the button must clear the fixed header
    await page.evaluate(() => {
      window.__captions = [];
      const caption = document.querySelector('#architecture-caption');
      new MutationObserver(() => {
        window.__captions.push({
          milestone: caption.querySelector('i')?.textContent ?? '',
          clock: caption.querySelector('b').textContent,
          narration: [...caption.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent)
            .join(''),
        });
      }).observe(caption, { childList: true });
    });
    await expect(site.followButton).toBeEnabled();
    await expect(site.architectureCaption).toBeHidden();

    await site.followButton.click();
    await expect(site.followButton).toBeDisabled();
    await expect(site.architectureCaption).toBeVisible();

    await expect(site.followButton).toBeEnabled({ timeout: 60_000 });
    const captions = await page.evaluate(() => window.__captions);
    const narrated = captions.slice(0, -1);
    expect(narrated.map(({ milestone, narration }) => ({ milestone, narration }))).toStrictEqual(
      STEPS_WITH_CAPTION.map((step) => ({
        milestone: step.milestone ?? '',
        narration: PT_BR.architecture.walkthrough[step.caption],
      })),
    );
    expect(narrated[0].clock).toBe('0,00 s'); // the simulated clock starts at zero; later readings depend on frame timing
    expect(captions.at(-1)).toStrictEqual({
      milestone: '',
      clock: 'fim',
      narration: PT_BR.architecture.walkthrough.done.replace('<b>fim</b>', ''),
    });

    await expect(site.architectureCaption).toHaveText(
      DictionaryText.plain(PT_BR.architecture.walkthrough.done),
    );
    await expect(site.architectureCaption).toBeHidden({ timeout: 10_000 }); // the closing caption stays for four seconds
    expect(await page.locator('#architecture-svg .packet-tracked').count()).toBe(0);
    expect(health.problems).toStrictEqual(PageHealth.NONE);
  });

  test('the palette command follows a Pix too: it scrolls to the map and plays the walkthrough to the end', async ({
    site,
    page,
  }) => {
    test.setTimeout(90_000);
    await site.open('/');
    await site.openPalette();
    await site.paletteInput.fill('seguir um pix');
    await expect(site.paletteSelected).toHaveText(
      PT_BR.palette.commands.followPix.title + PT_BR.palette.tags.map,
    );
    await page.keyboard.press('Enter');
    await expect(site.followButton).toBeDisabled({ timeout: 15_000 });
    await expect(site.architectureCaption).toBeVisible();
    await expect(site.followButton).toBeEnabled({ timeout: 40_000 });
  });

  test('the simulated traffic panel counts replicas against the ceiling of the diagram', async ({
    site,
    page,
  }) => {
    await site.open('/');
    await site.jumpTo('arquitetura');
    // The running count comes from a live simulation; the ceiling is the sum of every service's maximum.
    const ceiling = Object.values(Diagram.NODES).reduce(
      (sum, node) => sum + (node.maxReplicas ?? 0),
      0,
    );
    const [running, total] = (await page.locator('#architecture-replicas').textContent()).split(
      '/',
    );
    expect(total).toBe(String(ceiling));
    expect(String(Number(running))).toBe(running);
  });
});
