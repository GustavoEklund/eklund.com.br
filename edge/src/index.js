import {
  AuthorizationError,
  CimdFetchError,
  OAuthProvider,
  authorizationErrorRedirect,
} from '@cloudflare/workers-oauth-provider';
import { Collector } from './collector.js';
import { GithubSignIn } from './github-sign-in.js';
import { IncidentIssues } from './incident-issues.js';
import { LabInbox } from './lab-inbox.js';
import { LabStore } from './lab-store.js';
import { ReadingHandler } from './reading-handler.js';
import { ReadingQueries } from './reading-queries.js';
import { ReportStore } from './report-store.js';
import { Retention } from './retention.js';
import { Router } from './router.js';
import { UptimeMonitor } from './uptime-monitor.js';

/** The Cron Trigger of the uptime monitor. The other one, once a day, runs the retention. */
const EVERY_FIVE_MINUTES = '*/5 * * * *';
/** The routes anyone may reach: what the Worker is, what pages send and what the lab job sends. They never meet OAuth. */
const PUBLIC = /^\/(?:$|robots\.txt$|v1\/)/;
/** How long an access token lives, and a refresh token: an hour, and thirty days. */
const ACCESS_TOKEN_SECONDS = 3_600;
const REFRESH_TOKEN_SECONDS = 2_592_000;

/**
 * The Worker: the public routes go through the Router, and everything else through the OAuth provider, which serves the
 * readings at /mcp and /api/v1 to a token of the owner's GitHub account. The Cron Triggers check the site and run the retention.
 */
export default {
  fetch(request, env, context) {
    const origins = env.ORIGINS.split(' ');
    if (PUBLIC.test(new URL(request.url).pathname)) {
      const collector = new Collector({ origins, store: new ReportStore(env.DB) });
      const lab = env.LAB_TOKEN
        ? new LabInbox({ token: env.LAB_TOKEN, store: new LabStore(env.DB), reports: env.REPORTS })
        : null;
      return new Router({ origins, collector, lab }).handle(request);
    }
    const allowedLogins = (env.ALLOWED_GITHUB_LOGINS ?? '')
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);
    return new OAuthProvider({
      apiRoute: ['/mcp', '/api/'],
      apiHandler: {
        fetch: (apiRequest, apiEnv, apiContext) =>
          new ReadingHandler({
            allowedLogins,
            queries: new ReadingQueries({ db: apiEnv.DB }),
          }).handle(apiRequest, apiContext.props),
      },
      defaultHandler: {
        fetch: (pageRequest, pageEnv) =>
          new GithubSignIn({
            oauth: pageEnv.OAUTH_PROVIDER,
            errors: { AuthorizationError, CimdFetchError, authorizationErrorRedirect },
            fetch: globalThis.fetch.bind(globalThis),
            clientId: pageEnv.GITHUB_CLIENT_ID,
            clientSecret: pageEnv.GITHUB_CLIENT_SECRET,
            allowedLogins,
            github: {
              site: pageEnv.GITHUB_SITE ?? GithubSignIn.GITHUB.site,
              api: pageEnv.GITHUB_API ?? GithubSignIn.GITHUB.api,
            },
          }).handle(pageRequest),
      },
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/token',
      clientRegistrationEndpoint: '/register',
      accessTokenTTL: ACCESS_TOKEN_SECONDS,
      refreshTokenTTL: REFRESH_TOKEN_SECONDS,
      resourceMetadata: {
        resource: env.READING_RESOURCE,
        resource_name: 'Measurements of eklund.com.br',
      },
    }).fetch(request, env, context);
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
