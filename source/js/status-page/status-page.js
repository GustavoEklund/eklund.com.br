import { Dom } from '../shared/dom.js';
import { Formatter } from '../shared/format.js';
import { Environment } from '../shared/environment.js';
import { Level } from './health-checks.js';

const HISTORY_SECONDS = 90;
const MAX_INCIDENTS = 6;
const LOW_FPS_THRESHOLD = 20;
const LOW_FPS_SECONDS_BEFORE_INCIDENT = 3;
const BANNER_SECONDS_BEFORE_ANNOUNCING = 3; // a long task turns the banner amber for a second; only a change that holds is news

/** A status page for the page itself: live component checks, a 90-second strip and an incident log. */
export class StatusPage {
  #root;
  #checks;
  #globe;
  #rows;
  #history = [];
  #incidents = [];
  #secondLevel = Level.OPERATIONAL;
  #lowFpsSeconds = 0;

  #readings;
  #translator;
  #announce;
  #announcedLevel = null;
  #candidate = null;

  constructor({ root, checks, readings, globe, translator, announce }) {
    this.#root = root;
    this.#checks = checks;
    this.#readings = readings;
    this.#globe = globe;
    this.#translator = translator;
    this.#announce = announce;
  }

  start() {
    this.#rows = this.#renderComponentRows();
    this.#root.querySelector('#status-cells').innerHTML = '<i></i>'.repeat(HISTORY_SECONDS);
    this.#readings.subscribe((type, entry) => this.#onMetric(type, entry));
    this.#translator.onChange(() => {
      this.#renderIncidents();
      this.refresh();
    });
    setInterval(() => {
      if (!Environment.motionPaused) this.refresh();
    }, 1000);
    this.refresh();
    document.fonts.ready.then(() => this.refresh());
  }

  /** `describe` is called at every render, so an incident is retranslated when the visitor switches language. */
  addIncident(describe, level = Level.DEGRADED) {
    this.#incidents.unshift({ at: new Date(), describe });
    if (this.#incidents.length > MAX_INCIDENTS) this.#incidents.pop();
    this.#secondLevel = Math.max(this.#secondLevel, level);
    this.#renderIncidents();
  }

  recordLoadTest({ done, seconds }) {
    this.addIncident(
      () =>
        this.#translator.t('status.incidents.loadTest', { done: Formatter.integer(done), seconds }),
      Level.OPERATIONAL,
    );
  }

  refresh() {
    let worst = Level.OPERATIONAL;
    this.#checks.forEach((check, index) => {
      const { level, detail } = check.evaluate();
      worst = Math.max(worst, level);
      const row = this.#rows[index];
      row.detail.textContent = detail;
      this.#reserveRoom(row.reserve, check.reserve());
      row.badge.dataset.level = level;
      row.badgeText.textContent = this.#translator.t(`status.levels.${level}`);
    });
    this.#root.dataset.level = worst;
    this.#showBanner(worst);
    this.#root.querySelector('#status-updated').textContent = Formatter.clock(new Date());
    this.#trackFrameRate();
    this.#pushHistorySecond();
  }

  /** The banner is not a live region itself: it flips with every long task. A level that has held for three refreshes is announced once. */
  #showBanner(level) {
    const title = this.#translator.t(`status.banners.${level}`);
    Dom.setText(this.#root.querySelector('#status-title'), title);
    if (this.#announcedLevel === null) {
      this.#announcedLevel = level;
      return;
    }
    if (level === this.#announcedLevel) {
      this.#candidate = null;
      return;
    }
    this.#candidate =
      this.#candidate?.level === level
        ? { level, seconds: this.#candidate.seconds + 1 }
        : { level, seconds: 1 };
    if (this.#candidate.seconds < BANNER_SECONDS_BEFORE_ANNOUNCING) return;
    this.#announcedLevel = level;
    this.#candidate = null;
    this.#announce?.(title);
  }

  #renderIncidents() {
    const resolved = this.#translator.t('status.incidents.resolved');
    this.#root.querySelector('#status-incidents').innerHTML = this.#incidents.length
      ? this.#incidents
          .map(
            (incident) =>
              `<li><time>${Formatter.clock(incident.at)}</time><span>${incident.describe()}</span><span class="incident-resolution" data-i18n="status.incidents.resolved">${resolved}</span></li>`,
          )
          .join('')
      : `<li class="is-empty" data-i18n="status.incidents.none">${this.#translator.t('status.incidents.none')}</li>`;
    this.#root.querySelector('#status-incident-count').textContent = this.#incidents.length;
  }

  /** The row keeps the room of the longest text its check can show (`small::after` repeats it, unseen, in the same grid cell). */
  #reserveRoom(element, text) {
    if (text === null) element.removeAttribute('data-reserve');
    else element.dataset.reserve = text;
  }

  #renderComponentRows() {
    const list = this.#root.querySelector('#status-components');
    return this.#checks.map((check) => {
      const item = document.createElement('li');
      item.innerHTML = `<div><b data-i18n="${check.nameKey}">${check.name}</b><small><span class="status-detail">—</span></small></div><span class="status-badge" data-level="0"><i></i><span>—</span></span>`;
      list.append(item);
      return {
        reserve: item.querySelector('small'),
        detail: item.querySelector('.status-detail'),
        badge: item.querySelector('.status-badge'),
        badgeText: item.querySelector('.status-badge span'),
      };
    });
  }

  #onMetric(type, entry) {
    if (type === 'layout-shift' && entry.value > 0.01) {
      const value = entry.value;
      this.addIncident(() =>
        this.#translator.t('status.incidents.layoutShift', { value: Formatter.decimal(value, 3) }),
      );
    }
    if (type === 'long-task') {
      const duration = Math.round(entry.duration);
      this.addIncident(() => this.#translator.t('status.incidents.longTask', { duration }));
    }
  }

  #trackFrameRate() {
    const fps = this.#globe?.frameRate;
    if (this.#globe?.isRunning && fps && fps < LOW_FPS_THRESHOLD) {
      if (++this.#lowFpsSeconds === LOW_FPS_SECONDS_BEFORE_INCIDENT)
        this.addIncident(() =>
          this.#translator.t('status.incidents.lowFps', { threshold: LOW_FPS_THRESHOLD, fps }),
        );
    } else {
      this.#lowFpsSeconds = 0;
    }
  }

  #pushHistorySecond() {
    this.#history.push(this.#secondLevel);
    if (this.#history.length > HISTORY_SECONDS) this.#history.shift();
    this.#secondLevel = Level.OPERATIONAL;
    const cells = this.#root.querySelector('#status-cells').children;
    const offset = HISTORY_SECONDS - this.#history.length;
    for (let index = 0; index < HISTORY_SECONDS; index++) {
      const cell = cells[index];
      if (index < offset) {
        delete cell.dataset.level;
        continue;
      }
      cell.dataset.level = this.#history[index - offset];
      cell.classList.toggle('is-latest', index === HISTORY_SECONDS - 1);
    }
    const quietShare =
      this.#history.filter((level) => level === Level.OPERATIONAL).length / this.#history.length;
    this.#root.querySelector('#status-uptime').textContent = this.#translator.t(
      'status.history.quiet',
      { percent: Math.round(quietShare * 100) },
    );
  }
}
