import { useListScrapeJobs, useTriggerScrape, getListEventsQueryKey, getGetStatsOverviewQueryKey, getListScrapeJobsQueryKey } from "@workspace/api-client-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow, format } from "date-fns";
import { Database, Play, CheckCircle2, XCircle, Loader2, ServerCog, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function ScrapeControl() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data, isLoading, refetch } = useListScrapeJobs({ limit: 20 });
  const triggerScrape = useTriggerScrape();

  const handleRunScrape = () => {
    triggerScrape.mutate({ data: {} }, {
      onSuccess: () => {
        toast({
          title: "Scraper Started",
          description: "The data pipeline is now running. This may take a moment.",
        });
        // Invalidate queries so dashboard reflects new data
        queryClient.invalidateQueries({ queryKey: getListScrapeJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsOverviewQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
      },
      onError: (err) => {
        toast({
          title: "Failed to start scraper",
          description: "There was an error triggering the pipeline.",
          variant: "destructive"
        });
      }
    });
  };

  const isRunning = triggerScrape.isPending || data?.jobs?.some(j => j.status === 'running');

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/30">
      <Header />
      
      <main className="flex-grow container mx-auto px-4 py-12 max-w-5xl">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-foreground text-xs font-mono font-bold uppercase tracking-wider mb-4 border border-border">
              <ServerCog className="w-3.5 h-3.5" />
              Admin Controls
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">Data Pipeline</h1>
            <p className="text-muted-foreground mt-2 font-mono">Manage and monitor event ingestion jobs.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => refetch()}
              disabled={isLoading || isRunning}
              className="border-border/50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button 
              onClick={handleRunScrape} 
              disabled={isRunning}
              className="bg-primary text-primary-foreground font-bold shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:scale-[1.02] transition-transform"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scraping...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Scrape Now
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-12 gap-4 p-4 bg-secondary/50 border-b border-border/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <div className="col-span-3">Source</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-3">Results</div>
            <div className="col-span-4 text-right">Timing</div>
          </div>
          
          <div className="divide-y divide-border/50">
            {isLoading ? (
              Array(5).fill(0).map((_, i) => (
                <div key={i} className="p-4 grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-12"><Skeleton className="h-10 w-full" /></div>
                </div>
              ))
            ) : data?.jobs?.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center justify-center bg-secondary/10">
                <Database className="w-8 h-8 text-muted-foreground mb-3 opacity-50" />
                <p className="font-mono text-muted-foreground">No scrape jobs recorded yet.</p>
              </div>
            ) : (
              data?.jobs.map((job) => (
                <div key={job.id} className="p-4 grid grid-cols-12 gap-4 items-center hover:bg-secondary/10 transition-colors">
                  <div className="col-span-3 font-mono font-medium text-sm flex items-center gap-2">
                    {job.source}
                  </div>
                  
                  <div className="col-span-2">
                    {job.status === 'success' && (
                      <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20 font-mono text-xs">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Success
                      </Badge>
                    )}
                    {job.status === 'error' && (
                      <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20 font-mono text-xs">
                        <XCircle className="w-3 h-3 mr-1" /> Error
                      </Badge>
                    )}
                    {job.status === 'running' && (
                      <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20 font-mono text-xs">
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running
                      </Badge>
                    )}
                  </div>
                  
                  <div className="col-span-3 flex flex-col justify-center text-sm">
                    {job.status === 'running' ? (
                      <span className="text-muted-foreground font-mono">Processing...</span>
                    ) : job.status === 'error' ? (
                      <span className="text-destructive text-xs truncate max-w-full" title={job.errorMessage || ""}>
                        {job.errorMessage || "Unknown error"}
                      </span>
                    ) : (
                      <div className="flex gap-4 font-mono">
                        <span className="text-foreground"><span className="text-muted-foreground">Found:</span> {job.eventsFound}</span>
                        <span className="text-primary"><span className="text-muted-foreground">New:</span> {job.eventsUpserted}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="col-span-4 text-right flex flex-col justify-center">
                    <div className="text-sm font-medium text-foreground">
                      {format(new Date(job.startedAt), 'MMM d, h:mm a')}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {job.finishedAt ? (
                        <>took {((new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 1000).toFixed(1)}s</>
                      ) : (
                        <>started {formatDistanceToNow(new Date(job.startedAt))} ago</>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
