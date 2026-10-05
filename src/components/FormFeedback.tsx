/** The line under a form: what went wrong, or that it worked. */
export default function FormFeedback({
  error,
  success,
}: {
  error?: string | false | null;
  /** Shown when there's no error, e.g. "Saved." after `state.ok`. */
  success?: string | false | null;
}) {
  if (error) return <p className="text-sm font-medium text-accent">{error}</p>;
  if (success) return <p className="text-sm font-medium text-sea">{success}</p>;
  return null;
}
