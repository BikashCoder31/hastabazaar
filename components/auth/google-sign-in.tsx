export function GoogleSignIn({ returnTo }: { returnTo: string }) {
  return (
    <>
      <div className="my-6 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <a
        href={`/api/auth/google?return_to=${encodeURIComponent(returnTo)}`}
        className="flex w-full items-center justify-center gap-3 rounded-xl border bg-background px-5 py-3 font-semibold text-foreground shadow-xs transition-colors hover:bg-muted"
      >
        <span aria-hidden="true" className="grid size-6 place-items-center rounded-full border font-sans text-sm font-bold text-[#4285f4]">G</span>
        Continue with Google
      </a>
    </>
  );
}
