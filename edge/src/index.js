import { Collector } from './collector.js';
import { ReportStore } from './report-store.js';
import { Retention } from './retention.js';
import { Router } from './router.js';

/** The Worker: requests go through the Router, and the daily Cron Trigger runs the retention. */
export default {
  fetch(request, env) {
    const origins = env.ORIGINS.split(' ');
    const collector = new Collector({ origins, store: new ReportStore(env.DB) });
    return new Router({ origins, collector }).handle(request);
  },

  scheduled(controller, env, context) {
    context.waitUntil(new Retention(env.DB).run(new Date(controller.scheduledTime)));
  },
};
