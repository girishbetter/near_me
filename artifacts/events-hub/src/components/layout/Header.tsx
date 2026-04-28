import { Link } from "wouter";
import { useHealthCheck } from "@workspace/api-client-react";
import { Zap, Plus } from "lucide-react";

export function Header() {
  const { data: health } = useHealthCheck();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="bg-primary/10 p-1.5 rounded-lg group-hover:bg-primary/20 transition-colors">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
              TechEvents
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/events"
              className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-secondary/50 transition-colors"
            >
              Browse
            </Link>
            <Link
              href="/scrape"
              className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-secondary/50 transition-colors"
            >
              Data Pipeline
            </Link>
            <Link
              href="/events/new"
              className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-secondary/50 transition-colors"
            >
              Add Event
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {health && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-muted-foreground bg-secondary/30 px-2.5 py-1 rounded-full border border-border/50">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              API {health.status}
            </div>
          )}
          <Link
            href="/events/new"
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md text-sm font-semibold transition-all hover:shadow-[0_0_15px_rgba(6,182,212,0.4)] inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add Event
          </Link>
        </div>
      </div>
    </header>
  );
}
