import { Dom } from '../shared/dom.js';
import { GlobeShaders } from './shaders.js';

const KEYWORDS =
  /\b(uniform|in|out|void|float|vec[234]|mat[234]|precision|highp|mediump|lowp|return|if|else|for|layout|location|const|int|bool|discard)\b/g;
const BUILTINS =
  /\b(main|smoothstep|mix|dot|length|normalize|max|min|step|pow|exp|sqrt|clamp|fract|abs|sin|cos|fwidth|cross|reflect)(?=\()/g;
const NUMBERS = /(?<![\w.])(\d+\.?\d*)(?![\w])/g;

/** Minimal GLSL syntax highlighter: keywords, built-ins, numbers, comments and preprocessor lines. */
export class GlslHighlighter {
  static highlight(source) {
    return Dom.escapeHtml(source.trim())
      .split('\n')
      .map((line) => {
        const [code, ...comment] = line.split('//');
        const highlighted = code
          .replace(KEYWORDS, '<span class="tok-keyword">$1</span>')
          .replace(BUILTINS, '<span class="tok-function">$1</span>')
          .replace(NUMBERS, '<span class="tok-number">$1</span>')
          .replace(/^(#.*)$/, '<span class="tok-comment">$1</span>');
        return comment.length
          ? `${highlighted}<span class="tok-comment">//${comment.join('//')}</span>`
          : highlighted;
      })
      .join('\n');
  }
}

/** Shows the exact shader sources the globe is running. */
export class ShaderDialog {
  #dialog;
  #code;
  #openButton;
  #closeButton;

  constructor({ dialog, code, openButton, closeButton }) {
    this.#dialog = dialog;
    this.#code = code;
    this.#openButton = openButton;
    this.#closeButton = closeButton;
  }

  mount() {
    this.#code.innerHTML = GlobeShaders.showcase
      .map((source) => GlslHighlighter.highlight(source))
      .join('\n\n');
    this.#openButton.addEventListener('click', () => this.open());
    this.#closeButton.addEventListener('click', () => this.#dialog.close());
    this.#dialog.addEventListener('click', (event) => {
      if (event.target === this.#dialog) this.#dialog.close();
    });
    return this;
  }

  open() {
    this.#dialog.showModal();
  }
}
