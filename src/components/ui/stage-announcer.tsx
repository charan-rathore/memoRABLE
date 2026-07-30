/**
 * Polite status announcements for assistive technology. Import, replay,
 * reorder, mode switches and downloads post here; the visual UI stays quiet.
 */
export function StageAnnouncer({ message }: { message: string }) {
  return (
    <div aria-live="polite" role="status" className="visually-hidden" data-testid="stage-announcer">
      {message}
    </div>
  );
}
