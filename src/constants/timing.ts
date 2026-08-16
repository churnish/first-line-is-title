/**
 * Timing constants for delays, debounces, and timeouts.
 * Centralized to make delays clear and easy to adjust.
 */

export const TIMING = {
  /** Next tick delay (push to end of event loop) */
  NEXT_TICK_MS: 0,

  /** Delay before processing a newly created file (allows templates/other plugins to finish) */
  NEW_FILE_PROCESSING_DELAY_MS: 300,

  /** Debounce delay for editor changes to avoid processing every keystroke */
  EDITOR_CHANGE_DEBOUNCE_MS: 0,

  /** Delay to ensure UI is ready before showing modals */
  UI_READY_DELAY_MS: 100,

  /** Delay before processing file after creation (user setting, this is default) */
  DEFAULT_NEW_NOTE_DELAY_MS: 0,

  /** Maximum time to wait for YAML frontmatter insertion */
  YAML_INSERTION_TIMEOUT_MS: 5000,

  /** Delay for retry attempts in title insertion */
  TITLE_INSERTION_RETRY_DELAY_MS: 500,

  /** Delay for UI settling before rechecking file state */
  UI_SETTLE_DELAY_MS: 50,

  /** Delay to ensure file save is complete before processing */
  SAVE_COMPLETE_DELAY_MS: 100,

  /** Delay for clearing recently processed events tracker */
  EVENT_TRACKER_CLEAR_DELAY_MS: 100,

  /** Delay for view readiness check retry */
  VIEW_READINESS_RETRY_DELAY_MS: 100,

  /** Delay for cleanup of renamed files tracking */
  RENAME_TRACKING_CLEANUP_DELAY_MS: 150,

  /** Delay before positioning the cursor in a newly created file, so the editor view has mounted and can be found by path */
  RAF_CURSOR_POSITIONING_DELAY_MS: 200,

  /** Race window for Templater's creation event, measured from the file's ctime rather than from now because the CREATE handler has usually already burned part of it */
  TEMPLATER_EVENT_TIMEOUT_MS: 2000,

  /** Grace period before dropping the Templater listener, kept longer than the timeout above so the timeout resolves first and a late event cannot settle an already-settled promise */
  TEMPLATER_EVENT_CLEANUP_GRACE_MS: 100,

  /** Minimum gap between title insertions while a canvas is active, so a canvas creating many files at once does not trigger a mass insertion */
  TITLE_INSERTION_RATE_LIMIT_MS: 1000,

  /** Delay for focusing input elements after DOM updates */
  INPUT_FOCUS_DELAY_MS: 50,

  /** Rate limit for self-reference notices (prevents notice spam) */
  SELF_REF_NOTICE_TTL_MS: 2000,

  /** Delay after processFrontMatter before reading file (allows async disk write to complete) */
  FRONTMATTER_WRITE_DELAY_MS: 10,

  /** Window for detecting recently renamed files (prevents stale content processing) */
  RENAME_RECENTLY_WINDOW_MS: 100,

  /** TTL for file existence cache to reduce filesystem queries */
  CACHE_TTL_MS: 5000,

  /** Threshold for stale file locks (cleaned up during maintenance) */
  FILE_LOCK_STALE_THRESHOLD_MS: 60000,

  /** Threshold for stale needsFreshRead flags (cleaned up during maintenance) */
  NEEDS_FRESH_READ_STALE_THRESHOLD_MS: 300000,
} as const;

export const LIMITS = {
  /** Maximum characters in a filename title (from user settings default) */
  DEFAULT_MAX_TITLE_LENGTH: 100,

  /** Maximum retry attempts for title insertion */
  MAX_TITLE_INSERTION_RETRIES: 3,

  /** Maximum conflict resolution iterations (prevents infinite loops) */
  MAX_CONFLICT_ITERATIONS: 10000,

  /** Footnote popover detection threshold (editor/disk content size ratio) */
  FOOTNOTE_SIZE_THRESHOLD: 0.3,
} as const;
