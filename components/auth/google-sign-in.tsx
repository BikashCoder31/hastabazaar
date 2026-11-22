export function GoogleSignIn({ returnTo, showEmailDivider = true }: { returnTo: string; showEmailDivider?: boolean }) {
  return (
    <>
      <a
        href={`/api/auth/google?return_to=${encodeURIComponent(returnTo)}`}
        className="mt-4 flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border bg-white px-5 py-3 font-semibold text-[#14213d] transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-[#a8232e]"
      >
        <span aria-hidden="true" className="grid size-6 place-items-center rounded-full border font-sans text-sm font-bold text-[#4285f4]">G</span>
        Continue with Google
      </a>
      {showEmailDivider ? <div className="my-4 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium text-muted-foreground">or with your email</span>
        <span className="h-px flex-1 bg-border" />
      </div> : null}
    </>
  );
}
