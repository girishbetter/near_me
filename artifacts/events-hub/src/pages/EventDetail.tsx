import { useParams } from "wouter";
import { useGetEvent, getGetEventQueryKey } from "@workspace/api-client-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { format, formatDistanceToNow } from "date-fns";
import { Calendar, MapPin, ExternalLink, Tag, Zap, Monitor, Briefcase, Award, Clock, ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id || "0", 10);
  
  const { data: event, isLoading, isError } = useGetEvent(eventId, {
    query: {
      enabled: !!eventId,
      queryKey: getGetEventQueryKey(eventId)
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-grow container mx-auto px-4 py-8">
          <Skeleton className="w-32 h-6 mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="w-full h-[400px] rounded-2xl" />
              <Skeleton className="w-3/4 h-12" />
              <Skeleton className="w-full h-32" />
            </div>
            <div className="space-y-6">
              <Skeleton className="w-full h-64 rounded-xl" />
              <Skeleton className="w-full h-48 rounded-xl" />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-grow container mx-auto px-4 py-20 text-center flex flex-col items-center justify-center">
          <h1 className="text-4xl font-bold mb-4">Event Not Found</h1>
          <p className="text-muted-foreground font-mono mb-8">The event you're looking for doesn't exist or was removed.</p>
          <Link href="/events" className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-bold">
            Back to Browse
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const TypeIcon = event.type === 'hackathon' ? Zap : event.type === 'webinar' ? Monitor : Briefcase;
  const endDate = event.endDate ? new Date(event.endDate) : null;
  const isPast = endDate ? endDate < new Date() : false;

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/30">
      <Header />
      
      <main className="flex-grow">
        {/* Top visual header */}
        <div className="w-full h-64 md:h-80 relative overflow-hidden bg-secondary border-b border-border/50">
          {event.image ? (
            <>
              <img src={event.image} alt={event.title} className="w-full h-full object-cover blur-sm opacity-50 scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" />
          )}
          
          <div className="absolute inset-0 flex items-end">
            <div className="container mx-auto px-4 pb-8">
              <Link href="/events" className="inline-flex items-center gap-1 text-sm font-mono text-muted-foreground hover:text-foreground mb-6 transition-colors">
                <ChevronLeft className="w-4 h-4" /> Back to events
              </Link>
              
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge className="bg-primary text-primary-foreground font-bold uppercase tracking-wider text-xs border-none shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                  <TypeIcon className="w-3.5 h-3.5 mr-1" />
                  {event.type}
                </Badge>
                <Badge variant="outline" className="bg-background/80 backdrop-blur font-mono text-xs uppercase border-border/50">
                  {event.platform}
                </Badge>
                <Badge variant="outline" className="bg-background/80 backdrop-blur font-mono text-xs uppercase border-border/50">
                  {event.mode}
                </Badge>
              </div>
              
              <h1 className="text-3xl md:text-5xl font-extrabold tracking-tighter text-foreground max-w-4xl leading-[1.1]">
                {event.title}
              </h1>
              
              {event.organizer && (
                <p className="mt-4 text-lg text-muted-foreground font-medium flex items-center gap-2">
                  <span className="opacity-50">by</span> {event.organizer}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-10">
              
              {/* Image if available */}
              {event.image && (
                <div className="rounded-2xl overflow-hidden border border-border/50 shadow-lg bg-secondary">
                  <img src={event.image} alt={event.title} className="w-full object-cover max-h-[500px]" />
                </div>
              )}
              
              {/* Description */}
              <div className="prose prose-invert prose-lg max-w-none">
                <h2 className="text-2xl font-bold mb-4 tracking-tight border-b border-border/50 pb-2">About this event</h2>
                {event.description ? (
                  <div className="whitespace-pre-wrap text-muted-foreground leading-relaxed font-sans text-base">
                    {event.description}
                  </div>
                ) : (
                  <p className="text-muted-foreground italic">No detailed description provided.</p>
                )}
              </div>
              
              {/* Tags */}
              {event.tags && event.tags.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
                    <Tag className="w-4 h-4" /> Tags
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {event.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="font-mono px-3 py-1 bg-secondary/50 text-secondary-foreground border border-border/50">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Sidebar Sticky */}
            <div className="space-y-6">
              <div className="sticky top-24">
                
                {/* Action Card */}
                <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm mb-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10" />
                  
                  {endDate && !isPast && (
                    <div className="flex items-center gap-2 text-primary font-bold mb-6 bg-primary/10 px-3 py-2 rounded-md w-fit border border-primary/20">
                      <Clock className="w-4 h-4" />
                      Ends {formatDistanceToNow(endDate, { addSuffix: true })}
                    </div>
                  )}
                  
                  {isPast && (
                    <div className="flex items-center gap-2 text-muted-foreground font-bold mb-6 bg-secondary/50 px-3 py-2 rounded-md w-fit border border-border/50">
                      <Clock className="w-4 h-4" />
                      Event has ended
                    </div>
                  )}
                  
                  <a 
                    href={event.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-14 rounded-lg font-bold text-lg transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_15px_rgba(6,182,212,0.25)]"
                  >
                    Visit Event Page <ExternalLink className="w-5 h-5" />
                  </a>
                  <p className="text-center text-xs font-mono text-muted-foreground mt-4 opacity-70">
                    Opens in a new tab
                  </p>
                </div>
                
                {/* Details Card */}
                <div className="bg-secondary/20 border border-border/50 rounded-xl p-6 space-y-6">
                  <h3 className="font-bold tracking-tight text-lg border-b border-border/50 pb-3">Event Details</h3>
                  
                  {event.startDate && (
                    <div className="flex items-start gap-3">
                      <div className="bg-background p-2 rounded-md border border-border/50 shrink-0">
                        <Calendar className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-foreground">Date</div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(event.startDate), 'MMMM d, yyyy')}
                          {event.endDate && event.endDate !== event.startDate && ` - ${format(new Date(event.endDate), 'MMMM d, yyyy')}`}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-start gap-3">
                    <div className="bg-background p-2 rounded-md border border-border/50 shrink-0">
                      <MapPin className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-foreground">Location</div>
                      <div className="text-sm text-muted-foreground">
                        {event.mode === 'online' ? 'Online Event' : event.location || 'Location TBA'}
                      </div>
                    </div>
                  </div>
                  
                  {event.prize && (
                    <div className="flex items-start gap-3">
                      <div className="bg-background p-2 rounded-md border border-accent/30 shrink-0">
                        <Award className="w-5 h-5 text-accent" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-foreground">Prizes</div>
                        <div className="text-sm text-accent font-medium font-mono">{event.prize}</div>
                      </div>
                    </div>
                  )}
                </div>
                
              </div>
            </div>
            
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
