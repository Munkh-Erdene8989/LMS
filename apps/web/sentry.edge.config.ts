import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './lib/sentry-options';

const options = sentryOptions();
if (options) Sentry.init(options);
