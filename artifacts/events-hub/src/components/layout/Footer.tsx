export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-background mt-auto">
      <div className="container mx-auto px-4 py-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex flex-col items-center md:items-start gap-1">
          <span className="font-bold tracking-tight text-foreground">TechEvents Hub</span>
          <span className="text-sm text-muted-foreground">Discover your next hackathon or workshop.</span>
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          Built for builders. Not a generic SaaS.
        </div>
      </div>
    </footer>
  );
}
