import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";

// Pages
import Home from "@/pages/Home";
import Browse from "@/pages/Browse";
import EventDetail from "@/pages/EventDetail";
import ScrapeControl from "@/pages/ScrapeControl";
import AddEvent from "@/pages/AddEvent";
import MapView from "@/pages/MapView";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/events" component={Browse} />
      <Route path="/events/new" component={AddEvent} />
      <Route path="/events/:id" component={EventDetail} />
      <Route path="/map" component={MapView} />
      <Route path="/scrape" component={ScrapeControl} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="tech-events-hub-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
