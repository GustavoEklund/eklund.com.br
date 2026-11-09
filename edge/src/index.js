import { Collector } from './collector.js';
import { IncidentIssues } from './incident-issues.js';
import { LabInbox } from './lab-inbox.js';
import { LabStore } from './lab-store.js';
import { ReportStore } from './report-store.js';
import { Retention } from './retention.js';
import { Router } from './router.js';
import { UptimeMonitor } from './uptime-monitor.js';

/** The Cron Trigger of the uptime monitor. The other one, once a day, runs the retention. */
const EVERY_FIVE_MINUTES = '*/5 * * * *';

/** The Worker: requests go through the Router, and the Cron Triggers check the site and run the retention. */
export default {
  fetch(request, env) {
    const origins = env.ORIGINS.split(' ');
    const collector = new Collector({ origins, store: new ReportStore(env.DB) });
    const lab = env.LAB_TOKEN
      ? new LabInbox({ token: env.LAB_TOKEN, store: new LabStore(env.DB), reports: env.REPORTS })
      : null;
    return new Router({ origins, collector, lab }).handle(request);
  },

  scheduled(controller, env, context) {
    const fetch = globalThis.fetch.bind(globalThis);
    context.waitUntil(
      controller.cron === EVERY_FIVE_MINUTES
        ? new UptimeMonitor({
            db: env.DB,
            fetch,
            issues: new IncidentIssues({
              repository: env.OPERATIONS_REPOSITORY,
              token: env.OPERATIONS_TOKEN,
              fetch,
            }),
          }).run(env.UPTIME_TARGETS.split(' '))
        : new Retention(env.DB).run(new Date(controller.scheduledTime)),
    );
  },
};
