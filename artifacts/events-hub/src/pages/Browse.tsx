import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useListEvents, useGetTrendingTags, ListEventsParams } from "@workspace/api-client-react";
import { EventCard } from "@/components/EventCard";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Search, Filter, X, Zap, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export default function Browse() {
  const [location, setLocation] = useLocation();
  const searchString = useSearch();
  
  const [params, setParams] = useState<ListEventsParams>({ limit: 24 });
  
  // Parse query string on mount
  useEffect(() => {
    const searchParams = new URLSearchParams(searchString);
    const newParams: ListEventsParams = { limit: 24 };
    
    if (searchParams.has("type")) newParams.type = searchParams.get("type") as any;
    if (searchParams.has("mode")) newParams.mode = searchParams.get("mode") as any;
    if (searchParams.has("platform")) newParams.platform = searchParams.get("platform") || undefined;
    if (searchParams.has("tag")) newParams.tag = searchParams.get("tag") || undefined;
    if (searchParams.has("search")) newParams.search = searchParams.get("search") || undefined;
    
    setParams(newParams);
  }, [searchString]);

  const { data, isLoading, isError } = useListEvents(params);
  const { data: trendingData } = useGetTrendingTags({ limit: 10 });
  
  const updateParam = (key: keyof ListEventsParams, value: string | undefined) => {
    const searchParams = new URLSearchParams(searchString);
    if (value && value !== "all") {
      searchParams.set(key, value);
    } else {
      searchParams.delete(key);
    }
    setLocation(`/events?${searchParams.toString()}`);
  };

  const clearFilters = () => {
    setLocation("/events");
  };

  const hasActiveFilters = Object.keys(params).some(k => k !== 'limit' && k !== 'offset' && params[k as keyof ListEventsParams]);

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/30">
      <Header />
      
      <main className="flex-grow flex flex-col">
        {/* Filter Header */}
        <div className="bg-secondary/30 border-b border-border/50 sticky top-16 z-40 backdrop-blur-md">
          <div className="container mx-auto px-4 py-4">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Search events, platforms, tags..." 
                  className="pl-9 bg-background border-border/50 focus-visible:ring-primary"
                  value={params.search || ""}
                  onChange={(e) => updateParam("search", e.target.value)}
                />
              </div>
              
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <Select value={params.type || "all"} onValueChange={(v) => updateParam("type", v)}>
                  <SelectTrigger className="w-[140px] bg-background border-border/50 font-mono text-xs">
                    <SelectValue placeholder="Event Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="hackathon">Hackathon</SelectItem>
                    <SelectItem value="webinar">Webinar</SelectItem>
                    <SelectItem value="workshop">Workshop</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={params.mode || "all"} onValueChange={(v) => updateParam("mode", v)}>
                  <SelectTrigger className="w-[130px] bg-background border-border/50 font-mono text-xs">
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Mode</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
                
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-9 px-3 text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5 mr-1.5" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
            
            {/* Tag Quick Filters */}
            <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1 scrollbar-none">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0 mr-1" />
              {trendingData?.tags?.map(t => (
                <Badge 
                  key={t.tag}
                  variant={params.tag === t.tag ? "default" : "outline"}
                  className={`shrink-0 cursor-pointer font-mono text-[11px] rounded-sm border-border/50 transition-colors ${params.tag === t.tag ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}
                  onClick={() => updateParam("tag", params.tag === t.tag ? undefined : t.tag)}
                >
                  {t.tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Results Grid */}
        <div className="container mx-auto px-4 py-8 flex-grow">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold tracking-tight">
              {isLoading ? "Loading..." : data?.total ? `${data.total} Events Found` : "No Events Found"}
            </h2>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array(12).fill(0).map((_, i) => <Skeleton key={i} className="h-[340px] rounded-xl" />)}
            </div>
          ) : isError ? (
            <div className="py-20 text-center border border-dashed border-destructive/50 rounded-xl bg-destructive/10">
              <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-bold text-foreground mb-2">Failed to load events</h3>
              <p className="text-muted-foreground font-mono">Check your connection and try again.</p>
            </div>
          ) : data?.events?.length === 0 ? (
            <div className="py-24 flex flex-col items-center justify-center text-center border border-dashed border-border/50 rounded-xl bg-secondary/10">
              <div className="bg-background p-4 rounded-full mb-4 border border-border">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">No matches found</h3>
              <p className="text-muted-foreground font-mono mb-6 max-w-md">We couldn't find any events matching your current filters. Try broadening your search.</p>
              <Button onClick={clearFilters} variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground">
                Clear all filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {data?.events.map((event, i) => (
                <EventCard key={event.id} event={event} index={i} />
              ))}
            </div>
          )}
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
