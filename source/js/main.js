import { Dom } from './shared/dom.js';
import { Formatter } from './shared/format.js';
import { Environment } from './shared/environment.js';
import { ThemeColors } from './shared/theme-colors.js';
import { PageReadings } from './shared/page-readings.js';
import { LiveAnnouncer } from './accessibility/live-announcer.js';
import { MotionToggle } from './accessibility/motion-toggle.js';
import { ThemeController } from './theme/theme-controller.js';
import { CustomCursor } from './cursor/custom-cursor.js';
import { HeroReveal } from './hero/hero-reveal.js';
import { LocalClock } from './hero/local-clock.js';
import { Marquee } from './marquee/marquee.js';
import { Globe } from './globe/globe.js';
import { GlobeControls } from './globe/globe-controls.js';
import { ShaderDialog } from './globe/shader-dialog.js';
import { Destinations } from './globe/destinations.js';
import { HealthChecks } from './status-page/health-checks.js';
import { StatusPage } from './status-page/status-page.js';
import { TraceBuilder } from './trace-viewer/trace-builder.js';
import { TraceViewer } from './trace-viewer/trace-viewer.js';
import { ObservabilityDashboard } from './dashboard/observability-dashboard.js';
import { ArchitectureMap } from './architecture-map/architecture-map.js';
import { LoadTest } from './load-test/load-test.js';
import { HistoryAccordion } from './history/history-accordion.js';
import { ChevronField } from './contact/chevron-field.js';
import { EmailActions } from './contact/email-actions.js';
import { CommandPalette } from './command-palette/command-palette.js';
import { CustomScrollbar } from './scrollbar/custom-scrollbar.js';
import { ReadingProgress } from './scrollbar/reading-progress.js';
import { AnchorLinks } from './navigation/anchor-links.js';
import { Locale } from './i18n/locale.js';
import { Translator } from './i18n/translator.js';
import { LocaleSwitcher } from './i18n/locale-switcher.js';
import { Dictionaries } from './i18n/dictionaries.js';

const FRAME_RATE_CHIP_INTERVAL_MS = 500;
const TRACE_RENDER_DEBOUNCE_MS = 150;
const LOCALE_FADE_MS = 240;
const SECTIONS = [
  { labelKey: 'scrollbar.hero', selector: '#hero' },
  { labelKey: 'scrollbar.status', selector: '#status' },
  { labelKey: 'scrollbar.profile', selector: '#perfil' },
  { labelKey: 'scrollbar.architecture', selector: '#arquitetura' },
  { labelKey: 'scrollbar.load', selector: '#carga' },
  { labelKey: 'scrollbar.history', selector: '#historico' },
  { labelKey: 'scrollbar.contact', selector: '#contato' },
];
const LINKS = {
  github: 'https://github.com/GustavoEklund',
  repository: 'https://github.com/GustavoEklund/eklund.com.br',
  linkedin: 'https://www.linkedin.com/in/gustavo-eklund',
};

/** Composition root: builds every feature, wires them together, exposes a debug handle. */
class App {
  #readings = new PageReadings();
  #themeColors = new ThemeColors();
  #theme = new ThemeController(this.#themeColors);
  #globe = null;
  #field = null;
  #statusPage;
  #traceViewer;
  #loadTest = null;
  #architecture;
  #dashboard;
  #globeControls;
  #shaderDialog;
  #emailActions;
  #palette;
  #translator;
  #announcer;
  #motion;
  #marquee;
  #history;
  #traceRenderTimer = 0;

  start() {
    performance.mark('app:start');
    this.#mountLocale();
    this.#mountMotion();
    this.#mountTheme();
    this.#mountHero();
    this.#mountGlobe();
    this.#mountObservability();
    this.#mountSections();
    this.#mountNavigation();
    this.#mountChips();
    this.#motion.onChange(() => this.#syncMotion());
    performance.mark('app:ready');
    this.#exposeDebugHandle();
  }

  /** Picks the language, translates the markup, and mounts the switcher. Runs first: every feature renders text. */
  #mountLocale() {
    const locale = Locale.detect();
    Formatter.use(locale);
    this.#translator = new Translator({ dictionaries: Dictionaries.BY_LOCALE, locale }).mount();
    this.#translator.onChange((next) => this.#onLocaleChange(next));
    new LocaleSwitcher({
      root: Dom.require('.locale-switcher'),
      translator: this.#translator,
      onSelect: (next) => this.setLocale(next),
    }).install();
  }

  /** The visitor's choice: remembered, reflected in the URL, applied with a short cross-fade. */
  setLocale(tag) {
    const locale = Locale.normalize(tag);
    if (!locale || locale === this.#translator.locale) return;
    Locale.remember(locale);
    history.replaceState(null, '', Locale.urlFor(locale));
    const apply = () => this.#translator.setLocale(locale);
    if (!document.startViewTransition || Environment.prefersReducedMotion) return apply();
    document
      .startViewTransition(apply)
      .ready.then(() =>
        document.documentElement.animate(
          { opacity: [0, 1] },
          {
            duration: LOCALE_FADE_MS,
            easing: 'ease-out',
            pseudoElement: '::view-transition-new(root)',
          },
        ),
      )
      .catch(() => {
        /* transition skipped (hidden tab): the language already changed */
      });
  }

  /** Runs before every feature's own listener, so they all format with the new locale. */
  #onLocaleChange(locale) {
    Formatter.use(locale);
    this.#palette.replace(this.#commands());
    this.#renderPointCount(this.#globe?.instanceCount ?? 1);
  }

  /** The announcer and the pause button come before every feature: they decide how the rest behaves. */
  #mountMotion() {
    this.#announcer = new LiveAnnouncer(Dom.require('#announcer'));
    this.#motion = new MotionToggle({ button: Dom.require('#motion-toggle') }).mount();
  }

  /** Everything that moves by itself follows the pause button; CSS animations follow it through data-motion. */
  #syncMotion() {
    this.#marquee.sync();
    this.#history.sync();
    this.#architecture.sync();
    this.#field.sync();
    this.#loadTest?.sync();
    this.#palette.replace(this.#commands());
  }

  #mountTheme() {
    const themeToggle = Dom.require('#theme-toggle');
    const showTheme = () =>
      themeToggle.setAttribute('aria-pressed', String(this.#theme.theme === 'dark'));
    this.#theme.apply(this.#theme.theme);
    showTheme();
    this.#theme.onColorsChange(() => {
      showTheme();
      this.#globe?.recolor();
      this.#field?.recolor();
    });
    themeToggle.addEventListener('click', (event) => this.#theme.toggle(event));
    new CustomCursor({
      dot: Dom.require('.cursor-dot'),
      ring: Dom.require('.cursor-ring'),
    }).install();
  }

  #mountHero() {
    const hero = new HeroReveal({
      hero: Dom.require('#hero'),
      name: Dom.require('.hero-name'),
      globe: Dom.require('#globe'),
      modifierKey: Dom.require('#modifier-key'),
    });
    hero.prepare();
    hero.reveal(() => this.#globe?.startIntro());
    new LocalClock(Destinations.HOME.timeZone).start((time) => {
      Dom.setText(Dom.require('#local-time'), `· ${time}`);
      Dom.setText(Dom.require('#local-time-secondary'), time);
    });
    this.#marquee = new Marquee(Dom.require('#marquee'));
    this.#marquee.start();
  }

  #mountGlobe() {
    const canvas = Dom.require('#globe-canvas');
    this.#globe = Globe.create(canvas, this.#themeColors, {
      onFirstFrame: () => this.#scheduleTraceRender(),
    });
    if (this.#globe) this.#globe.mount();
    else Dom.require('#globe').classList.add('is-fallback');
    this.#shaderDialog = new ShaderDialog({
      dialog: Dom.require('#shader-dialog'),
      code: Dom.require('#shader-code'),
      openButton: Dom.require('#shader-button'),
      closeButton: Dom.require('#shader-close'),
    }).mount();
    this.#globeControls = new GlobeControls({
      root: Dom.require('.globe-controls'),
      globe: this.#globe,
      theme: this.#theme,
      translator: this.#translator,
      onInstancesChange: (instances) => {
        this.#renderPointCount(instances);
        this.#statusPage?.refresh();
      },
    }).mount();
  }

  #mountObservability() {
    const readings = this.#readings,
      globe = this.#globe,
      translator = this.#translator;
    this.#statusPage = new StatusPage({
      root: Dom.require('#status-page'),
      checks: HealthChecks.forThisPage({ readings, globe, translator, theme: this.#theme }),
      readings,
      globe,
      translator,
      announce: (message) => this.#announcer.announce(message, 'status-banner'),
    });
    this.#statusPage.start();
    this.#traceViewer = new TraceViewer({
      root: Dom.require('#trace-viewer'),
      builder: new TraceBuilder({ readings, globe, translator }),
      translator,
    });
    this.#traceViewer.mount();
    readings.subscribe((type) => {
      if (type === 'paint' || type === 'lcp' || type === 'network') this.#scheduleTraceRender();
    });
    this.#dashboard = new ObservabilityDashboard({ root: Dom.require('#dashboard'), translator });
    this.#dashboard.mount();
  }

  #mountSections() {
    this.#architecture = new ArchitectureMap({
      root: Dom.require('#architecture'),
      svg: Dom.require('#architecture-svg'),
      tooltip: Dom.require('#architecture-tooltip'),
      caption: Dom.require('#architecture-caption'),
      followButton: Dom.require('#architecture-follow'),
      translator: this.#translator,
    }).mount();
    if (LoadTest.isSupported())
      this.#loadTest = new LoadTest({
        root: Dom.require('#load-test'),
        translator: this.#translator,
        onFinished: (result) => this.#onLoadTestFinished(result),
      }).mount();
    this.#history = new HistoryAccordion(Dom.require('#history'));
    this.#history.install();
    this.#field = new ChevronField(Dom.require('#chevron-field'), this.#themeColors);
    this.#field.mount();
    this.#emailActions = new EmailActions({
      emailLink: Dom.require('#email-link'),
      toast: Dom.require('#copied-toast'),
      onCopied: () => this.#announcer.announce(this.#translator.t('contact.copiedAnnouncement')),
    });
    this.#emailActions.install();
  }

  #mountNavigation() {
    new CustomScrollbar({
      root: Dom.require('#scrollbar'),
      sections: SECTIONS,
      translator: this.#translator,
    }).install();
    new ReadingProgress(Dom.require('.reading-progress')).install();
    new AnchorLinks().install();
    this.#palette = new CommandPalette({
      dialog: Dom.require('#command-palette'),
      input: Dom.require('#command-palette-input'),
      list: Dom.require('#command-palette-list'),
      emptyMessage: Dom.require('#command-palette-empty'),
      openButton: Dom.require('#command-palette-button'),
      onResults: (count) =>
        this.#announcer.announce(
          count
            ? this.#translator.plural('palette.results', count)
            : this.#translator.t('palette.empty'),
          'palette-results',
        ),
    });
    this.#palette.replace(this.#commands());
    this.#palette.install();
  }

  #commands() {
    const palette = () => this.#palette;
    const goTo = (selector) => {
      palette().close();
      Dom.query(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const closeThen = (action) => () => {
      palette().close();
      action();
    };
    const command = (id, tag, run, params) => ({
      title: this.#translator.t(`palette.commands.${id}.title`, params),
      keywords: this.#translator.t(`palette.commands.${id}.keywords`),
      tag: this.#translator.t(`palette.tags.${tag}`),
      run,
    });
    const otherLocale = Locale.SUPPORTED.find((locale) => locale !== this.#translator.locale);
    return [
      command('status', 'go', () => goTo('#status')),
      command('profile', 'go', () => goTo('#perfil')),
      command('architecture', 'go', () => goTo('#arquitetura')),
      command(
        'followPix',
        'map',
        closeThen(() => {
          Dom.require('#architecture').scrollIntoView({ behavior: 'smooth', block: 'center' });
          this.#architecture.followPix();
        }),
      ), // the map itself, not the section top: its loop only runs while it is on screen
      command('load', 'go', () => goTo('#carga')),
      command('runLoad', 'action', () => {
        goTo('#carga');
        setTimeout(() => this.#loadTest?.run(), 600);
      }),
      command('history', 'go', () => goTo('#historico')),
      command('contact', 'go', () => goTo('#contato')),
      command(
        'copyEmail',
        'action',
        closeThen(() => this.#emailActions.copyEmail()),
      ),
      command(
        'toggleTheme',
        'theme',
        closeThen(() => this.#theme.toggle()),
      ),
      command(
        'randomHue',
        'theme',
        closeThen(() => this.#globeControls.randomizeHue()),
      ),
      command(
        'goHome',
        'globe',
        closeThen(() => {
          Dom.require('#hero').scrollIntoView({ behavior: 'smooth' });
          this.#globe?.goHome();
        }),
        { city: Destinations.HOME.name },
      ),
      command(
        'shader',
        'code',
        closeThen(() => this.#shaderDialog.open()),
      ),
      command(
        'github',
        'external',
        closeThen(() => open(LINKS.github, '_blank', 'noopener')),
      ),
      command(
        'source',
        'external',
        closeThen(() => open(LINKS.repository, '_blank', 'noopener')),
      ),
      command(
        'linkedin',
        'external',
        closeThen(() => open(LINKS.linkedin, '_blank', 'noopener')),
      ),
      {
        ...command(
          'switchLocale',
          'language',
          closeThen(() => this.setLocale(otherLocale)),
        ),
        lang: otherLocale,
      }, // named in its own language, so it says which
      command(
        this.#motion.paused ? 'resumeMotion' : 'pauseMotion',
        'action',
        closeThen(() => this.#motion.set(!this.#motion.paused)),
      ),
      // What dragging the globe and its three numbers does, for anyone who cannot drag (WCAG 2.5.7)
      command(
        'hueUp',
        'globe',
        closeThen(() => this.#globeControls.nudge('hue', 1)),
      ),
      command(
        'hueDown',
        'globe',
        closeThen(() => this.#globeControls.nudge('hue', -1)),
      ),
      command(
        'speedUp',
        'globe',
        closeThen(() => this.#globeControls.nudge('speed', 1)),
      ),
      command(
        'speedDown',
        'globe',
        closeThen(() => this.#globeControls.nudge('speed', -1)),
      ),
      command(
        'pointsUp',
        'globe',
        closeThen(() => this.#globeControls.nudge('instances', 1)),
      ),
      command(
        'pointsDown',
        'globe',
        closeThen(() => this.#globeControls.nudge('instances', -1)),
      ),
      command(
        'spinGlobe',
        'globe',
        closeThen(() => this.#globe?.kick()),
      ),
    ];
  }

  #onLoadTestFinished(result) {
    this.#statusPage.recordLoadTest(result);
    this.#announcer.announce(
      this.#translator.t('loadTest.announcement', {
        done: Formatter.integer(result.done),
        peak: Formatter.integer(result.peak),
      }),
    );
  }

  #mountChips() {
    const readings = this.#readings;
    const renderNetwork = () => {
      Dom.setText(Dom.require('#chip-network'), Math.round(readings.transferredBytes / 1024));
      Dom.setText(Dom.require('#page-size'), Math.round(readings.ownUncompressedBytes / 1024));
    };
    const renderPaint = () =>
      Dom.setText(Dom.require('#chip-fcp'), `${Math.round(readings.firstContentfulPaint)} ms`);
    readings.subscribe((type) => {
      if (type === 'network') renderNetwork();
      if (type === 'paint') renderPaint();
    });
    renderNetwork();
    if (readings.firstContentfulPaint) renderPaint();
    this.#renderPointCount(1);
    if (this.#globe)
      setInterval(() => {
        if (!Environment.motionPaused)
          Dom.setText(
            Dom.require('#chip-fps'),
            this.#globe.isRunning && this.#globe.frameRate ? this.#globe.frameRate : '—',
          );
      }, FRAME_RATE_CHIP_INTERVAL_MS);
    Dom.setText(Dom.require('#current-year'), new Date().getFullYear());
  }

  #renderPointCount(instances) {
    Dom.setText(
      Dom.require('#chip-points'),
      this.#globe ? Formatter.integer(this.#globe.pointCount * instances) : '—',
    );
  }

  #scheduleTraceRender() {
    clearTimeout(this.#traceRenderTimer);
    this.#traceRenderTimer = setTimeout(() => this.#traceViewer.render(), TRACE_RENDER_DEBOUNCE_MS);
  }

  /** Open the console and play: eklund.globe.setSpeed(3), eklund.field.recolor(), eklund.setLocale('en') */
  #exposeDebugHandle() {
    window.eklund = {
      globe: this.#globe,
      field: this.#field,
      trace: this.#traceViewer,
      status: this.#statusPage,
      dashboard: this.#dashboard,
      architecture: this.#architecture,
      loadTest: this.#loadTest,
      theme: this.#theme,
      translator: this.#translator,
      setLocale: (tag) => this.setLocale(tag),
    };
  }
}

new App().start();
