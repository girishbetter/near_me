import { Link } from "wouter";
import { formatDistanceToNow, format } from "date-fns";
import { Calendar, MapPin, Monitor, Ticket, Globe, Briefcase, Zap, AlertCircle } from "lucide-react";
import { Event } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";

export function EventCard({ event, index = 0 }: { event: Event; index?: number }) {
  const endDate = event.endDate ? new Date(event.endDate) : null;
  const isPast = endDate ? endDate < new Date() : false;
  
  const TypeIcon = event.type === 'hackathon' ? Zap : event.type === 'webinar' ? Monitor : Briefcase;
  
  return (
    <Link href={`/events/${event.id}`}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        whileHover={{ y: -5, scale: 1.02 }}
        className="group relative flex flex-col h-full bg-card rounded-xl border border-card-border overflow-hidden hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] hover:border-primary/50 transition-all duration-300"
      >
        <div className="relative h-40 w-full overflow-hidden bg-secondary">
          {event.image ? (
            <img 
              src={event.image} 
              alt={event.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 via-accent/20 to-background flex items-center justify-center">
              <TypeIcon className="w-12 h-12 text-primary/40" />
            </div>
          )}
          
          <div className="absolute top-3 left-3 flex flex-wrap gap-2">
            <Badge variant="secondary" className="bg-background/90 backdrop-blur text-foreground font-mono text-xs shadow-sm">
              {event.platform}
            </Badge>
          </div>
          
          {endDate && !isPast && (
            <div className="absolute top-3 right-3">
              <Badge variant="outline" className="bg-primary/90 text-primary-foreground border-none font-semibold shadow-sm backdrop-blur">
                in {formatDistanceToNow(endDate)}
              </Badge>
            </div>
          )}
        </div>
        
        <div className="flex flex-col flex-grow p-5">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary uppercase tracking-wider">
              <TypeIcon className="w-3.5 h-3.5" />
              {event.type}
            </div>
            <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0 border-border/50 text-muted-foreground">
              {event.mode}
            </Badge>
          </div>
          
          <h3 className="font-bold text-lg leading-tight text-foreground mb-3 line-clamp-2 group-hover:text-primary transition-colors">
            {event.title}
          </h3>
          
          <div className="space-y-2 mt-auto pt-4 border-t border-border/40">
            {event.startDate && (
              <div className="flex items-center text-xs text-muted-foreground gap-2">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span>{format(new Date(event.startDate), 'MMM d, yyyy')}</span>
              </div>
            )}
            
            {event.location && event.mode !== 'online' && (
              <div className="flex items-center text-xs text-muted-foreground gap-2">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span className="truncate">{event.location}</span>
              </div>
            )}
          </div>
          
          {event.tags && event.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {event.tags.slice(0, 3).map(tag => (
                <span key={tag} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-secondary/50 text-secondary-foreground border border-border/50">
                  {tag}
                </span>
              ))}
              {event.tags.length > 3 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-secondary/30 text-muted-foreground border border-border/30">
                  +{event.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </Link>
  );
}
