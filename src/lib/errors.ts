export function isExclusionViolationError(error: unknown): error is { cause: { code: string } } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'cause' in error &&
    typeof (error as any).cause === 'object' &&
    (error as any).cause !== null &&
    'code' in (error as any).cause
  );
}