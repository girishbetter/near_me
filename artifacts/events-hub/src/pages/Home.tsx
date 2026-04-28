import { useGetStatsOverview, useGetTrendingTags, useGetUpcomingDeadlines, useListEvents } from "@workspace/api-client-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { EventCard } from "@/components/EventCard";
import { ArrowRight, Activity, Zap, TrendingUp, Clock, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export default function Home() {
  const { data: stats, isLoading: statsLoading } = useGetStatsOverview();
  const { data: trendingData, isLoading: tagsLoading } = useGetTrendingTags({ limit: 8 });
  const { data: upcomingData, isLoading: upcomingLoading } = useGetUpcomingDeadlines({ limit: 4 });
  const { data: recentData, isLoading: recentLoading } = useListEvents({ limit: 12 });

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/30">
      <Header />
      
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="relative py-20 overflow-hidden border-b border-border/50">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background"></div>
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.apply/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none"></div>
          
          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-3xl">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-bold uppercase tracking-wider mb-6 border border-primary/20"
              >
                <Activity className="w-3.5 h-3.5" />
                Live Event Feed
              </motion.div>
              
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-5xl md:text-7xl font-extrabold tracking-tighter text-foreground mb-6 leading-[1.1]"
              >
                Find your next <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">hackathon.</span>
              </motion.h1>
              
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-xl text-muted-foreground mb-10 max-w-xl font-medium"
              >
                The most dense, real-time discovery board for tech events. Aggregated from across the web. No fluff, just deadlines and details.
              </motion.p>
              
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex flex-wrap items-center gap-4"
              >
                <Link href="/events" className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-lg bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                  Browse Events
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.div>
            </div>
            
            {/* Stats Row */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16 pt-8 border-t border-border/50"
            >
              {statsLoading ? (
                Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
              ) : stats ? (
                <>
                  <div className="bg-secondary/30 border border-border/50 p-4 rounded-xl flex flex-col justify-center">
                    <span className="text-3xl font-bold text-foreground">{stats.totalEvents}</span>
                    <span className="text-sm font-mono text-muted-foreground uppercase mt-1">Total Events</span>
                  </div>
                  <div className="bg-secondary/30 border border-border/50 p-4 rounded-xl flex flex-col justify-center">
                    <span className="text-3xl font-bold text-primary">{stats.hackathons}</span>
                    <span className="text-sm font-mono text-muted-foreground uppercase mt-1">Hackathons</span>
                  </div>
                  <div className="bg-secondary/30 border border-border/50 p-4 rounded-xl flex flex-col justify-center">
                    <span className="text-3xl font-bold text-accent">{stats.workshops}</span>
                    <span className="text-sm font-mono text-muted-foreground uppercase mt-1">Workshops</span>
                  </div>
                  <div className="bg-secondary/30 border border-border/50 p-4 rounded-xl flex flex-col justify-center">
                    <span className="text-3xl font-bold text-destructive">{stats.upcomingThisWeek}</span>
                    <span className="text-sm font-mono text-muted-foreground uppercase mt-1">Ending this week</span>
                  </div>
                </>
              ) : null}
            </motion.div>
          </div>
        </section>

        {/* Trending Tags */}
        <section className="py-8 bg-secondary/20 border-b border-border/50 overflow-hidden">
          <div className="container mx-auto px-4 flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground shrink-0">
              <TrendingUp className="w-4 h-4 text-primary" />
              Trending
            </div>
            <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none">
              {tagsLoading ? (
                Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-24 rounded-full shrink-0" />)
              ) : trendingData?.tags?.map((t) => (
                <Link key={t.tag} href={`/events?tag=${t.tag}`} className="shrink-0 px-4 py-1.5 rounded-full bg-background border border-border hover:border-primary text-sm font-mono text-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <span>{t.tag}</span>
                  <span className="text-xs text-muted-foreground">{t.count}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Upcoming Deadlines */}
        <section className="py-16 container mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="bg-destructive/10 p-2 rounded-lg">
                <Clock className="w-6 h-6 text-destructive" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Closing Soon</h2>
            </div>
            <Link href="/events" className="text-sm font-bold text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {upcomingLoading ? (
              Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-[340px] rounded-xl" />)
            ) : upcomingData?.events?.length ? (
              upcomingData.events.map((event, i) => (
                <EventCard key={`upcoming-${event.id}`} event={event} index={i} />
              ))
            ) : (
              <div className="col-span-full py-12 text-center border border-dashed border-border/50 rounded-xl bg-secondary/10">
                <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground font-mono">No urgent deadlines found.</p>
              </div>
            )}
          </div>
        </section>

        {/* Recent Events */}
        <section className="py-16 bg-secondary/10 border-t border-border/50">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Freshly Scraped</h2>
              </div>
              <Link href="/events" className="text-sm font-bold text-primary hover:underline flex items-center gap-1">
                Browse database <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {recentLoading ? (
                Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-[340px] rounded-xl" />)
              ) : recentData?.events?.length ? (
                recentData.events.map((event, i) => (
                  <EventCard key={`recent-${event.id}`} event={event} index={i} />
                ))
              ) : (
                <div className="col-span-full py-12 text-center border border-dashed border-border/50 rounded-xl bg-background">
                  <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground font-mono">No events in the database.</p>
                </div>
              )}
            </div>
            
            <div className="mt-12 flex justify-center">
              <Link href="/events" className="inline-flex items-center justify-center h-12 px-8 rounded-lg bg-background border border-border hover:border-primary text-foreground font-bold hover:text-primary transition-all">
                Load More Events
              </Link>
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
}
