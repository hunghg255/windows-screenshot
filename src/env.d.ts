import type { ScreenshotAPI } from '../shared/contracts';
declare global { interface Window { screenshot: ScreenshotAPI; recording: import('../shared/recording-contracts').RecordingAPI } }
