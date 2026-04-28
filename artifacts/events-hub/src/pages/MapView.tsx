import { useMemo } from "react";
import { Link } from "wouter";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useListEvents } from "@workspace/api-client-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, MapPin, ExternalLink } from "lucide-react";

// React-Leaflet's default marker uses bundler-relative image URLs that
// 404 under Vite. Wire it up to the CDN-hosted PNGs once at module load.
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const INDIA_CENTER: [number, number] = [20.5937, 78.9629];

export default function MapView() {
  const { data, isLoading, isError } = useListEvents({
    withCoords: true,
    limit: 200,
  });

  const eventsWithCoords = useMemo(() => {
    if (!data?.events) return [];
    return data.events.filter(
      (e) =>
        typeof e.latitude === "number" &&
        typeof e.longitude === "number" &&
        Number.isFinite(e.latitude) &&
        Number.isFinite(e.longitude),
    );
  }, [data]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="w-6 h-6 text-primary" />
              Event Map
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isLoading
                ? "Loading events…"
                : `${eventsWithCoords.length} of ${data?.total ?? 0} events have known coordinates.`}
            </p>
          </div>
          <Badge variant="secondary" className="font-mono text-xs">
            OpenStreetMap · Nominatim geocoder
          </Badge>
        </div>

        {isError ? (
          <div className="border border-destructive/40 bg-destructive/10 text-destructive rounded-lg p-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Failed to load events.
          </div>
        ) : isLoading ? (
          <Skeleton className="w-full h-[600px] rounded-lg" />
        ) : (
          <div
            className="w-full rounded-lg overflow-hidden border border-border/60"
            style={{ height: "600px" }}
            data-testid="event-map"
          >
            <MapContainer
              center={INDIA_CENTER}
              zoom={3}
              minZoom={2}
              scrollWheelZoom
              style={{ height: "100%", width: "100%" }}
              worldCopyJump
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {eventsWithCoords.map((event) => (
                <Marker
                  key={event.id}
                  position={[event.latitude as number, event.longitude as number]}
                >
                  <Popup>
                    <div className="space-y-1.5 min-w-[200px] max-w-[260px]">
                      <div className="font-semibold text-sm leading-snug">
                        {event.title}
                      </div>
                      {event.location && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {event.location}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <span>{event.platform}</span>
                        <span>·</span>
                        <span>{event.type}</span>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Link
                          href={`/events/${event.id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          Details
                        </Link>
                        <a
                          href={event.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                        >
                          Visit <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        )}

        {!isLoading && !isError && eventsWithCoords.length === 0 && (
          <p className="text-sm text-muted-foreground mt-4">
            No geocoded events yet. The geocoder runs after each scrape pass and
            is rate-limited to one Nominatim call per second, so locations fill
            in gradually.
          </p>
        )}
      </main>
      <Footer />
    </div>
  );
}
