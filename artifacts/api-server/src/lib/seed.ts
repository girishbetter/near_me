import { db, eventsTable, scrapeJobsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { InsertEvent } from "@workspace/db";
import { logger } from "./logger";

const now = Date.now();
const days = (n: number) => new Date(now + n * 24 * 60 * 60 * 1000);

const SEED_EVENTS: InsertEvent[] = [
  {
    title: "AI Agents Hackathon 2026",
    platform: "unstop",
    type: "hackathon",
    url: "https://unstop.com/o/ai-agents-hackathon-2026",
    image:
      "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&q=80",
    startDate: days(7),
    endDate: days(14),
    mode: "online",
    tags: ["AI", "LLM", "Agents", "Python"],
    organizer: "OpenBuild Foundation",
    location: null,
    prize: "INR 5,00,000",
    description:
      "Build production-grade autonomous agents using the latest LLM tooling. Open to students and early-career engineers worldwide.",
  },
  {
    title: "Web3 Builders Summit Hackathon",
    platform: "devpost",
    type: "hackathon",
    url: "https://devpost.com/h/web3-builders-summit",
    image:
      "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&q=80",
    startDate: days(3),
    endDate: days(10),
    mode: "hybrid",
    tags: ["Web3", "Solidity", "DeFi", "Blockchain"],
    organizer: "Ethereum Foundation",
    location: "San Francisco, CA",
    prize: "USD 50,000",
    description:
      "A weekend of building decentralized apps with mentors from leading Web3 protocols.",
  },
  {
    title: "Climate Tech Open Innovation",
    platform: "unstop",
    type: "hackathon",
    url: "https://unstop.com/o/climate-tech-open-innovation",
    image:
      "https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=800&q=80",
    startDate: days(20),
    endDate: days(35),
    mode: "online",
    tags: ["Climate", "Sustainability", "Data Science"],
    organizer: "Greenhouse Labs",
    location: null,
    prize: "INR 3,00,000",
    description:
      "Use open climate datasets to prototype tools that help cities measure and reduce emissions.",
  },
  {
    title: "Rust Systems Programming Workshop",
    platform: "eventbrite",
    type: "workshop",
    url: "https://eventbrite.com/e/rust-systems-workshop",
    image:
      "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&q=80",
    startDate: days(5),
    endDate: days(5),
    mode: "online",
    tags: ["Rust", "Systems", "Programming"],
    organizer: "Recurse Center",
    location: null,
    prize: null,
    description:
      "An intensive one-day workshop on writing safe, performant systems code in Rust.",
  },
  {
    title: "Designing for Accessibility — Live Webinar",
    platform: "eventbrite",
    type: "webinar",
    url: "https://eventbrite.com/e/designing-for-accessibility-webinar",
    image:
      "https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=800&q=80",
    startDate: days(2),
    endDate: days(2),
    mode: "online",
    tags: ["Design", "A11y", "UX"],
    organizer: "Inclusive Design Collective",
    location: null,
    prize: null,
    description:
      "Practical patterns for shipping accessible interfaces from day one. Live Q&A with designers from Shopify and Atlassian.",
  },
  {
    title: "Kaggle Days Mumbai 2026",
    platform: "unstop",
    type: "workshop",
    url: "https://unstop.com/o/kaggle-days-mumbai-2026",
    image:
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80",
    startDate: days(28),
    endDate: days(29),
    mode: "offline",
    tags: ["Machine Learning", "Kaggle", "Data Science"],
    organizer: "Kaggle",
    location: "Mumbai, India",
    prize: "INR 2,00,000",
    description:
      "Two days of competitive ML, talks from Grandmasters, and an in-person hackathon.",
  },
  {
    title: "Smart India Hackathon 2026",
    platform: "unstop",
    type: "hackathon",
    url: "https://unstop.com/o/smart-india-hackathon-2026",
    image:
      "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&q=80",
    startDate: days(45),
    endDate: days(47),
    mode: "offline",
    tags: ["Government", "Open Innovation", "Students"],
    organizer: "Ministry of Education, GoI",
    location: "Multiple Cities, India",
    prize: "INR 1,00,000 per problem",
    description:
      "India's flagship student hackathon. Solve problems from real ministries and PSUs in a 36-hour grand finale.",
  },
  {
    title: "Postgres Performance Tuning Workshop",
    platform: "eventbrite",
    type: "workshop",
    url: "https://eventbrite.com/e/postgres-performance-tuning",
    image:
      "https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=800&q=80",
    startDate: days(11),
    endDate: days(11),
    mode: "online",
    tags: ["Postgres", "Database", "Performance"],
    organizer: "Citus Data",
    location: null,
    prize: null,
    description:
      "Hands-on workshop covering EXPLAIN ANALYZE, indexing strategies, and partitioning.",
  },
  {
    title: "Deep Dive: Vector Databases for RAG",
    platform: "eventbrite",
    type: "webinar",
    url: "https://eventbrite.com/e/vector-databases-rag-webinar",
    image:
      "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&q=80",
    startDate: days(4),
    endDate: days(4),
    mode: "online",
    tags: ["AI", "RAG", "Vector DB", "Embeddings"],
    organizer: "Pinecone",
    location: null,
    prize: null,
    description:
      "How to architect retrieval-augmented generation pipelines that scale to millions of documents.",
  },
  {
    title: "FlutterCon Asia 2026",
    platform: "devpost",
    type: "hackathon",
    url: "https://devpost.com/h/fluttercon-asia-2026",
    image:
      "https://images.unsplash.com/photo-1551650975-87deedd944c3?w=800&q=80",
    startDate: days(60),
    endDate: days(62),
    mode: "hybrid",
    tags: ["Flutter", "Mobile", "Dart"],
    organizer: "Flutter Community",
    location: "Singapore",
    prize: "USD 15,000",
    description:
      "Three days of Flutter talks, workshops, and a closing 24-hour hackathon.",
  },
  {
    title: "MLOps in Production — Live Webinar",
    platform: "eventbrite",
    type: "webinar",
    url: "https://eventbrite.com/e/mlops-in-production-webinar",
    image:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80",
    startDate: days(1),
    endDate: days(1),
    mode: "online",
    tags: ["MLOps", "Machine Learning", "DevOps"],
    organizer: "Weights & Biases",
    location: null,
    prize: null,
    description:
      "Real-world lessons from teams shipping ML systems at scale.",
  },
  {
    title: "Game Off 2026 — Indie Game Jam",
    platform: "devpost",
    type: "hackathon",
    url: "https://devpost.com/h/game-off-2026",
    image:
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80",
    startDate: days(15),
    endDate: days(45),
    mode: "online",
    tags: ["Game Dev", "Indie", "Unity", "Godot"],
    organizer: "GitHub",
    location: null,
    prize: "USD 10,000",
    description:
      "A month-long game jam with a surprise theme revealed on day one. Open to solo developers and small teams.",
  },
];

export async function seedIfEmpty(): Promise<void> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventsTable);
  const count = row?.count ?? 0;
  if (count > 0) {
    logger.info({ count }, "Skipping seed — events already present");
    return;
  }
  logger.info("Seeding initial events");
  await db.insert(eventsTable).values(SEED_EVENTS);
  await db.insert(scrapeJobsTable).values({
    source: "seed",
    status: "success",
    eventsFound: SEED_EVENTS.length,
    eventsUpserted: SEED_EVENTS.length,
    finishedAt: new Date(),
  });
  logger.info({ count: SEED_EVENTS.length }, "Seed complete");
}
