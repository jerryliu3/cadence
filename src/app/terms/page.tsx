export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Terms</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        By using Goalmaxxing, you agree to use the app responsibly and not abuse or
        disrupt the service for other users.
      </p>
      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Account use</h2>
        <p className="text-sm text-muted-foreground">
          You are responsible for your account credentials and activity performed from
          your account.
        </p>
      </section>
      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Availability</h2>
        <p className="text-sm text-muted-foreground">
          We may update, improve, or temporarily pause parts of the service to maintain
          reliability and security.
        </p>
      </section>
      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Acceptable behavior</h2>
        <p className="text-sm text-muted-foreground">
          Do not attempt unauthorized access, abuse platform APIs, or post harmful
          content through social features.
        </p>
      </section>
    </main>
  );
}
