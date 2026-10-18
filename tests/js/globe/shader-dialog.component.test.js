import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ShaderDialog, GlslHighlighter } from '@site/js/globe/shader-dialog.js';
import { GlobeShaders } from '@site/js/globe/shaders.js';

describe('ShaderDialog', () => {
  let dialog, code, openButton, closeButton, shaderDialog;

  beforeEach(() => {
    document.body.innerHTML =
      '<button id="open">open</button><dialog id="dialog"><button id="close">close</button><pre><code id="code"></code></pre><p id="inside">inside</p></dialog>';
    [dialog, code, openButton, closeButton] = ['dialog', 'code', 'open', 'close'].map((id) =>
      document.getElementById(id),
    );
    shaderDialog = new ShaderDialog({ dialog, code, openButton, closeButton });
  });

  afterEach(() => {
    if (dialog.open) dialog.close();
  });

  it('fills the code block with the four highlighted shader sources, separated by blank lines, and returns itself', () => {
    expect(shaderDialog.mount()).toBe(shaderDialog);
    const expected = document.createElement('code');
    expected.innerHTML = GlobeShaders.showcase
      .map((source) => GlslHighlighter.highlight(source))
      .join('\n\n');
    expect(code.innerHTML).toBe(expected.innerHTML);
  });

  it('shows exactly the code the globe runs: the text equals the sources, trimmed and joined', () => {
    shaderDialog.mount();
    expect(code.textContent).toBe(
      GlobeShaders.showcase.map((source) => source.trim()).join('\n\n'),
    );
  });

  it('opens as a modal from its button, and not before', () => {
    shaderDialog.mount();
    expect(dialog.open).toBe(false);
    openButton.click();
    expect([dialog.open, dialog.matches(':modal')]).toStrictEqual([true, true]);
  });

  it('opens from code too', () => {
    shaderDialog.mount();
    shaderDialog.open();
    expect(dialog.open).toBe(true);
  });

  it('closes from its close button', () => {
    shaderDialog.mount();
    shaderDialog.open();
    closeButton.click();
    expect(dialog.open).toBe(false);
  });

  it('closes when the backdrop is clicked, but not when the content is', () => {
    shaderDialog.mount();
    shaderDialog.open();
    document.getElementById('inside').click();
    expect(dialog.open).toBe(true);
    dialog.click();
    expect(dialog.open).toBe(false);
  });
});
