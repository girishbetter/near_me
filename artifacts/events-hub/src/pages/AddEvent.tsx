import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  useCreateEvent,
  getListEventsQueryKey,
  getGetStatsOverviewQueryKey,
  getGetTrendingTagsQueryKey,
  getGetUpcomingDeadlinesQueryKey,
} from "@workspace/api-client-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Loader2 } from "lucide-react";

const TYPE_OPTIONS = ["hackathon", "webinar", "workshop", "other"] as const;
const MODE_OPTIONS = ["online", "offline", "hybrid", "unknown"] as const;

type FormState = {
  title: string;
  url: string;
  type: (typeof TYPE_OPTIONS)[number];
  mode: (typeof MODE_OPTIONS)[number];
  image: string;
  startDate: string;
  endDate: string;
  tags: string;
  organizer: string;
  location: string;
  prize: string;
  description: string;
};

const INITIAL_STATE: FormState = {
  title: "",
  url: "",
  type: "hackathon",
  mode: "online",
  image: "",
  startDate: "",
  endDate: "",
  tags: "",
  organizer: "",
  location: "",
  prize: "",
  description: "",
};

function toIsoOrNull(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function AddEvent() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>(
    {},
  );

  const createEvent = useCreateEvent();

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.title.trim()) next.title = "Title is required";
    if (!form.url.trim()) next.url = "URL is required";
    else if (!form.url.trim().startsWith("https://"))
      next.url = "URL must start with https://";
    else if (form.url.includes("#")) next.url = "URL cannot contain '#'";
    if (form.startDate && form.endDate) {
      const s = new Date(form.startDate).getTime();
      const e = new Date(form.endDate).getTime();
      if (!Number.isNaN(s) && !Number.isNaN(e) && e < s) {
        next.endDate = "End date must be after start date";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    createEvent.mutate(
      {
        data: {
          title: form.title.trim(),
          url: form.url.trim(),
          type: form.type,
          mode: form.mode,
          image: form.image.trim() || null,
          startDate: toIsoOrNull(form.startDate),
          endDate: toIsoOrNull(form.endDate),
          tags,
          organizer: form.organizer.trim() || null,
          location: form.location.trim() || null,
          prize: form.prize.trim() || null,
          description: form.description.trim() || null,
        },
      },
      {
        onSuccess: (created) => {
          toast({
            title: "Event added",
            description: `"${created.title}" is now in the hub.`,
          });
          queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getGetStatsOverviewQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetTrendingTagsQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetUpcomingDeadlinesQueryKey(),
          });
          setLocation(`/events/${created.id}`);
        },
        onError: (err: unknown) => {
          const message =
            err instanceof Error ? err.message : "Could not create event";
          toast({
            title: "Failed to add event",
            description: message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const isSubmitting = createEvent.isPending;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-10 max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Link
              href="/events"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to events
            </Link>
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Plus className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">
                Add an event
              </h1>
            </div>
            <p className="text-muted-foreground mb-8">
              Manually add an event you want to see in the hub. The link must be
              a real https URL — no placeholders.
            </p>
          </motion.div>

          <motion.form
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            onSubmit={handleSubmit}
            className="space-y-6 bg-card border border-border rounded-xl p-6 sm:p-8"
          >
            <div className="grid gap-2">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="e.g. Replit Hack Night 2026"
                required
              />
              {errors.title && (
                <p className="text-xs text-destructive">{errors.title}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="url">
                Event URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="url"
                type="url"
                value={form.url}
                onChange={(e) => update("url", e.target.value)}
                placeholder="https://example.com/event"
                required
              />
              {errors.url && (
                <p className="text-xs text-destructive">{errors.url}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>
                  Type <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    update("type", v as FormState["type"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>
                  Mode <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.mode}
                  onValueChange={(v) =>
                    update("mode", v as FormState["mode"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODE_OPTIONS.map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="startDate">Start date</Label>
                <Input
                  id="startDate"
                  type="datetime-local"
                  value={form.startDate}
                  onChange={(e) => update("startDate", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="endDate">End / deadline</Label>
                <Input
                  id="endDate"
                  type="datetime-local"
                  value={form.endDate}
                  onChange={(e) => update("endDate", e.target.value)}
                />
                {errors.endDate && (
                  <p className="text-xs text-destructive">{errors.endDate}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="organizer">Organizer</Label>
                <Input
                  id="organizer"
                  value={form.organizer}
                  onChange={(e) => update("organizer", e.target.value)}
                  placeholder="Replit"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={form.location}
                  onChange={(e) => update("location", e.target.value)}
                  placeholder="San Francisco / Online"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="image">Cover image URL</Label>
                <Input
                  id="image"
                  type="url"
                  value={form.image}
                  onChange={(e) => update("image", e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="prize">Prize / reward</Label>
                <Input
                  id="prize"
                  value={form.prize}
                  onChange={(e) => update("prize", e.target.value)}
                  placeholder="$10,000"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={form.tags}
                onChange={(e) => update("tags", e.target.value)}
                placeholder="AI, Web3, Open Source (comma separated)"
              />
              <p className="text-xs text-muted-foreground">
                Separate with commas. Up to 12 tags.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={5}
                placeholder="What's the event about? Who is it for?"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLocation("/events")}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add event
                  </>
                )}
              </Button>
            </div>
          </motion.form>
        </div>
      </main>
      <Footer />
    </div>
  );
}
